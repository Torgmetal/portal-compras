import "server-only";
import { itensExpediveisDaOP, chaveMarca } from "./itens-expedicao";

// ─── CONFERÊNCIA DE PEÇA ──────────────────────────────────────────────────────
//
// Matheus (08/09/2026): "precisa lincar a coluna quantidade com a L.E; caso ele digitar uma peça 3
// vezes mas na lista só tem 2 vai dar erro e mensagem avisando (…) a ideia é usar essa tela em um
// celular em campo ou tablet para ele conferir as peças antes de ir para pintura e etiquetagem".
//
// A regra inteira mora aqui, e não na rota, porque ela é a razão de a tela existir: sem o vínculo
// com a L.E. isto seria um bloco de notas.

export const STATUS = { ABERTA: "ABERTA", FINALIZADA: "FINALIZADA", CANCELADA: "CANCELADA" };

/**
 * Serializa qualquer leitura+gravação que dispute o saldo de UMA obra.
 *
 * ⚠⚠ ACHADO DO CODEX (09/09/2026): POST e PUT liam o saldo e só depois gravavam, sem exclusão
 * mútua — duas conferências de "+1" simultâneas na mesma marca, com saldo 1, passavam as DUAS
 * (uma simulação chegou a gravar 3 num previsto de 2). `pg_advisory_xact_lock` tranca por OP
 * (o hash da string do id) só até o fim da transação: quem chega depois FICA PARADO na fila do
 * Postgres até o primeiro terminar, então a segunda chamada já lê o saldo atualizado — não dois
 * retratos velhos que se sobrepõem. Escopo de transação (não de sessão) para funcionar com o
 * pooler do Neon: uma transação interativa do Prisma prende UMA conexão até o fim, exatamente o
 * que o modo transaction do PgBouncer já faz por padrão.
 *
 * @param {string} opId
 * @param {(tx: import("@prisma/client").Prisma.TransactionClient) => Promise<T>} fn
 * @returns {Promise<T>}
 * @template T
 */
export async function comTravaDaObra(prisma, opId, fn) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${opId}))`;
    return fn(tx);
  }, { timeout: 15_000, maxWait: 15_000 });
}

/** Quem fez, para o registro. Existe para o `user?.x || null` não se repetir em cada gravação. */
export const autorDe = (user) => ({ id: user?.id || null, nome: user?.name || null });

/**
 * O que já foi conferido nesta OBRA, marca a marca.
 *
 * ⚠⚠ O TETO É DA OBRA, NÃO DA SESSÃO. Se a L.E. tem 2 peças de T97A140 e a conferência de ontem
 * pegou as 2, a de hoje não pode aceitar mais nenhuma — a obra não tem uma terceira. Contar só
 * dentro da sessão aberta deixaria a mesma peça ser conferida quantas vezes se abrisse sessão.
 *
 * ⚠ Sessão CANCELADA não conta. É o desfazer de quem abriu por engano; se contasse, um erro de
 * clique consumiria o saldo da obra para sempre.
 */
export async function conferidoPorMarca(prisma, opId) {
  const sessoes = await prisma.conferenciaPeca.findMany({
    where: { opId, status: { not: STATUS.CANCELADA } },
    select: { id: true },
  });
  if (!sessoes.length) return new Map();

  const somas = await prisma.conferenciaPecaItem.groupBy({
    by: ["marca"],
    where: { conferenciaId: { in: sessoes.map((s) => s.id) } },
    _sum: { qte: true },
  });
  return new Map(somas.map((s) => [chaveMarca(s.marca), s._sum.qte || 0]));
}

/**
 * QUANDO CADA MARCA FOI CONFERIDA — na obra INTEIRA, não só nesta conferência.
 *
 * ⚠⚠ É O QUE FALTAVA NA PLANILHA DO PCP. Matheus (21/09/2026): "é interessante manter a data que
 * a peça foi conferida nos demais, se ele for mandando parcial, para saber em qual data tal peça
 * foi conferida sem precisar ir nos outros arquivos". As colunas "desta remessa" respondem o que
 * é NOVO; esta responde QUANDO foi, mesmo que tenha sido três semanas antes, e evita abrir os
 * arquivos anteriores para descobrir.
 *
 * ⚠ Cancelada fica de fora, pela mesma razão que fica fora do saldo: sessão cancelada é o desfazer
 * de quem abriu por engano, e datar uma marca por ela seria datar o que não aconteceu.
 *
 * ⚠ A data é a do ÚLTIMO lançamento da marca. Marca contada em dias diferentes (parcial hoje,
 * resto na semana que vem) mostra a mais recente — o detalhe por lançamento está na aba
 * "Lançamentos" de cada planilha, que é onde se olha quando o número não bate.
 *
 * @returns {Promise<Map<string, Date>>} chave da marca → data do último lançamento
 */
export async function conferidaEmPorMarca(prisma, opId) {
  const sessoes = await prisma.conferenciaPeca.findMany({
    where: { opId, status: { not: STATUS.CANCELADA } },
    select: { id: true },
  });
  if (!sessoes.length) return new Map();

  const datas = await prisma.conferenciaPecaItem.groupBy({
    by: ["marca"],
    where: { conferenciaId: { in: sessoes.map((s) => s.id) } },
    _max: { criadoEm: true },
  });
  return new Map(datas.filter((d) => d._max?.criadoEm).map((d) => [chaveMarca(d.marca), d._max.criadoEm]));
}

/**
 * A L.E. da obra com o andamento de cada marca.
 * @returns {Promise<{op:object, marcas:object[]}|null>}
 */
export async function saldosDaOP(prisma, opId) {
  const dados = await itensExpediveisDaOP(prisma, opId);
  if (!dados) return null;
  const [feito, quando] = await Promise.all([
    conferidoPorMarca(prisma, opId),
    conferidaEmPorMarca(prisma, opId),
  ]);

  const marcas = dados.pecas.map((p) => {
    const previsto = Math.max(1, Number(p.qte) || 1);
    const conferido = feito.get(chaveMarca(p.marca)) || 0;
    return {
      marca: p.marca,
      descricao: p.descricao || "",
      previsto,
      conferido,
      saldo: Math.max(0, previsto - conferido),
      completa: conferido >= previsto,
      // ⚠ O peso vem junto desde 17/09/2026: o PCP usa a conferência para montar romaneio, e
      // romaneio sem peso não fecha carga. Sai daqui e não de uma segunda consulta para não haver
      // duas fontes de peso da mesma marca (ver `pesoUnitKg` em `lib/itens-expedicao.js`).
      pesoUnitKg: Number(p.pesoUnitKg) || 0,
      // ⚠ Quando a marca foi conferida, em QUALQUER conferência da obra — ver `conferidaEmPorMarca`.
      conferidaEm: quando.get(chaveMarca(p.marca)) || null,
    };
  });

  return { op: dados.op, marcas };
}

/**
 * Vale este lançamento?
 *
 * ⚠ AS DUAS RECUSAS SÃO COISAS DIFERENTES E A MENSAGEM PRECISA DIZER QUAL. "Não está na lista" é a
 * peça errada na mão; "já conferiu tudo" é a peça certa contada duas vezes. Quem está no pátio com
 * o celular resolve cada uma de um jeito, e um "erro" genérico não ajuda em nenhuma das duas.
 *
 * @param {{marcas:object[]}} saldos  o que `saldosDaOP` devolveu
 * @returns {{ok:true, item:object}|{ok:false, erro:string}}
 */
export function validarLancamento(saldos, { marca, qte }) {
  const chave = chaveMarca(marca);
  if (!chave) return { ok: false, erro: "Informe a marca da peça." };

  const n = Number(qte);
  if (!Number.isInteger(n) || n < 1) return { ok: false, erro: "A quantidade tem que ser um número inteiro de 1 para cima." };

  const item = saldos.marcas.find((m) => chaveMarca(m.marca) === chave);
  if (!item) {
    return { ok: false, erro: `${marca} não está na Lista de Expedição desta obra — confira a marca da peça.` };
  }

  if (item.conferido + n > item.previsto) {
    return { ok: false, erro: mensagemDeExcesso(item, n) };
  }
  return { ok: true, item };
}

/**
 * Vale ESTA CORREÇÃO de um lançamento que já existe?
 *
 * ⚠⚠ O PRÓPRIO LANÇAMENTO SAI DA CONTA ANTES DE VALIDAR. Matheus (08/09/2026): "depois de conferir
 * uma marca, ser possível editar a quantidade dela lá em CONFERIDO NESTA SESSÃO antes de encerrar a
 * conferência". Se a L.E. prevê 10 e alguém lançou 10 por engano, corrigir para 3 tem de passar —
 * validando contra o saldo cru, `conferido` já é 10 e QUALQUER correção seria recusada, inclusive
 * as que DIMINUEM. O bug seria pior que a ausência da funcionalidade: a tela deixaria consertar só
 * o que não precisava.
 *
 * @param {{marcas:object[]}} saldos   o que `saldosDaOP` devolveu (já inclui o item atual)
 * @param {{marca:string, qte:number}} item  o lançamento como está gravado hoje
 * @param {number|string} novaQte
 */
export function validarEdicao(saldos, item, novaQte) {
  const chave = chaveMarca(item.marca);

  // ⚠⚠ LANÇAMENTO DE UMA MARCA QUE SAIU DA L.E. (achado do Codex, 14/09/2026). Desde que a planilha
  // passou a definir sozinha o conjunto de marcas, uma revisão da engenharia pode excluir uma marca
  // que JÁ FOI conferida — e o lançamento continua gravado, como tem de continuar. Sem esta saída,
  // `validarLancamento` diria "não está na Lista de Expedição" e recusaria QUALQUER correção,
  // inclusive as que DIMINUEM: quem quisesse desfazer o excesso ficaria preso a ele.
  //
  // ⚠ Diminuir e igualar passam; AUMENTAR não. Não existe planejado contra o que medir o aumento, e
  // deixar crescer livre seria criar teto infinito justamente onde a lista não ampara mais nada.
  if (!saldos.marcas.some((m) => chaveMarca(m.marca) === chave)) {
    const antes = Number(item.qte) || 0;
    const pedida = Number(novaQte) || 0;
    if (pedida > antes) {
      return { ok: false, erro: `${item.marca} saiu da Lista de Expedição numa revisão. Dá para corrigir para menos, não para mais.` };
    }
    return { ok: true, foraDaLista: true };
  }

  const marcas = saldos.marcas.map((m) => {
    if (chaveMarca(m.marca) !== chave) return m;
    const conferido = Math.max(0, m.conferido - (Number(item.qte) || 0));
    return { ...m, conferido, saldo: Math.max(0, m.previsto - conferido), completa: conferido >= m.previsto };
  });
  return validarLancamento({ marcas }, { marca: item.marca, qte: novaQte });
}

/** A frase que aparece no celular. Diz o número da lista, o que já foi e o que ainda cabe. */
export function mensagemDeExcesso(item, pedido) {
  const { marca, previsto, conferido, saldo } = item;
  const pc = (n) => `${n} peça${n === 1 ? "" : "s"}`;
  if (saldo === 0) {
    return `${marca}: a Lista de Expedição tem ${pc(previsto)} e você já conferiu ${conferido}. Essa marca está completa.`;
  }
  return `${marca}: a Lista de Expedição tem ${pc(previsto)} e você já conferiu ${conferido}. ` +
    `Cabe${saldo === 1 ? "" : "m"} mais ${pc(saldo)}, não ${pedido}.`;
}

/** Quanto da obra já passou pela conferência — o número do topo da tela. */
export function progresso(marcas) {
  const previsto = marcas.reduce((s, m) => s + m.previsto, 0);
  const conferido = marcas.reduce((s, m) => s + Math.min(m.conferido, m.previsto), 0);
  return {
    previsto,
    conferido,
    marcasCompletas: marcas.filter((m) => m.completa).length,
    marcasTotal: marcas.length,
    pct: previsto ? Math.round((conferido / previsto) * 100) : 0,
  };
}
