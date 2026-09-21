// ─── PEDIDO DE COMPRA ENCERRADO NO OMIE ──────────────────────────────────────
//
// Matheus (17/09/2026): "precisamos ajustar que o portal reconheça os pedidos ENCERRADOS do Omie
// para não ficar como atrasado, principalmente quando é FATURAMENTO DIRETO".
//
// ⚠⚠ ENCERRADO NÃO É RECEBIDO, E ESTE MÓDULO NUNCA BAIXA NADA. Encerrar é ato administrativo —
// o comprador diz "deste pedido não vem mais nada". Não prova que o material chegou, então aqui
// não se escreve `statusEntrega`, `dataEntregaReal` nem `Recebimento`. A única coisa que muda é a
// cobrança de PRAZO na tela: um pedido encerrado para de aparecer como atrasado.
//
// ⚠⚠ NO FATURAMENTO DIRETO ISSO É ESTRUTURAL, não exceção. O material vai do fornecedor direto à
// obra e nunca entra NF no almoxarifado da Torg — `nQtdeRec` fica 0 para sempre, e por isso o
// pedido nunca "chega" sozinho. Medido em 17/09/2026: dos 48 pedidos FD, 9 sem chegada registrada;
// 4 deles já estavam encerrados no Omie e vermelhos na tela.
//
// ⚠⚠ A ETAPA NÃO SERVE, E ISSO FOI MEDIDO. `cEtapa` vale "15" tanto em pendente quanto em
// encerrado, e `ConsultarPedCompra` não expõe bandeira nenhuma de encerramento (ver
// docs/memoria-claude/torg_omie_recebimento.md). Quem separa é o FILTRO da pesquisa:
// `PesquisarPedCompra{lExibirPedidosEncerrados:"T"}`. Conferido em 17/09 numa amostra de 2026 —
// 200 encerrados contra 95 pendentes, interseção ZERO. As outras grafias que tentei
// (`lExibirEncerrados`, `lExibirPedidosEncerrado`) o Omie rejeita como tag inexistente.
import { omieCall } from "./omie-call.js";
import { log } from "@/lib/log";
import { comTravaDeCron } from "@/lib/cron-trava";

const registro = log("omie-encerramento");
const URL_PED = "https://app.omie.com.br/api/v1/produtos/pedidocompra/";

const p2 = (n) => String(n).padStart(2, "0");
const fmtBR = (d) => `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`;

/** Teto de páginas da varredura (100 por página). 701 encerrados em 17/09/2026 → 8 páginas. */
export const MAX_PAGINAS = 40;

/**
 * A janela de datas que a pesquisa precisa cobrir para que uma AUSÊNCIA signifique alguma coisa.
 *
 * ⚠⚠ JANELA FIXA MENTIRIA NO DIA SEGUINTE. Se a varredura cobre 2023-2027 e o pedido é de 2022,
 * ele fica fora do conjunto de encerrados por não ter sido procurado — e uma reconciliação que
 * trata ausência como "reabriu" apagaria a marca de um pedido que ninguém tocou. A janela sai dos
 * PEDIDOS LOCAIS: do mais antigo que interessa até bem depois do último.
 */
export function janelaDaColeta(datas) {
  const tempos = (datas || []).map((d) => new Date(d).getTime()).filter((t) => Number.isFinite(t));
  const hoje = new Date();
  const de = new Date(tempos.length ? Math.min(...tempos) : hoje.getTime());
  de.setMonth(de.getMonth() - 2); // margem: o Omie filtra pela data do PEDIDO, não pela do portal
  const ate = new Date(hoje);
  ate.setFullYear(ate.getFullYear() + 2);
  return { de, ate };
}

/**
 * Colhe no Omie o conjunto de pedidos de compra ENCERRADOS na janela pedida.
 *
 * ⚠⚠ O RETORNO DIZ SE A COLETA FICOU COMPLETA, e quem chama TEM de olhar. Achado do Codex
 * (17/09/2026): `buscarNFsPorPedidos` engole o erro e devolve um mapa possivelmente parcial —
 * copiar esse contrato aqui seria pior que não ter a funcionalidade, porque uma página que falhou
 * viraria "este pedido reabriu" e a marca sumiria sozinha. Falha, timeout ou teto de páginas
 * atingido ⇒ `completa: false`, e a reconciliação só marca, nunca desmarca.
 *
 * @returns {Promise<{codigos: Set<string>, completa: boolean, paginas: number, motivo: string|null}>}
 */
/**
 * A resposta é um RETRATO utilizável, ou é lixo com cara de resposta?
 *
 * ⚠⚠ ISTO ERA UM BURACO DE PERDA TOTAL, e o Codex achou (17/09/2026). O código lia
 * `d.pedidos_pesquisa || []` e `Number(d.nTotalPaginas || 1)`: uma resposta `{}` — Omie fora do ar
 * devolvendo corpo vazio, mudança de contrato, proxy engolindo o JSON — virava "coletei tudo e não
 * há NENHUM encerrado", com `completa: true`. E `completa: true` é exatamente a licença para
 * DESMARCAR. Uma resposta vazia apagaria a marca dos 33 pedidos de uma vez.
 *
 * ⚠ Ausência de campo não é campo com zero. Sem `pedidos_pesquisa` em forma de lista e sem
 * `nTotalPaginas` numérico, não há retrato — e sem retrato não se desmarca nada.
 */
function retratoValido(d) {
  return !!d && Array.isArray(d.pedidos_pesquisa) && Number.isFinite(Number(d.nTotalPaginas));
}

/** Uma página da pesquisa: `{ d }` quando veio retrato, `{ motivo }` quando não. */
async function buscarPagina(flag, { de, ate }, pg, ateMs) {
  let d;
  try {
    // ⚠ O prazo desce até o `fetch` (ver `ateMs` em `lib/omie-call.js`). Conferir o relógio só
    // ANTES da página não impedia esta chamada de gastar 45s × 5 tentativas sozinha — e era aí
    // que o cron morria por timeout sem chegar a devolver `completa:false`.
    d = await omieCall(URL_PED, "PesquisarPedCompra", {
      nPagina: pg, nRegsPorPagina: 100, lApenasImportadoApi: "F", [flag]: "T",
      dDataInicial: fmtBR(de), dDataFinal: fmtBR(ate),
    }, { ateMs: Number.isFinite(ateMs) ? ateMs : undefined });
  } catch (e) {
    registro.aviso("[encerramento] página", pg, "falhou:", e?.message);
    return { motivo: e?.message || "falha na pesquisa" };
  }
  if (!retratoValido(d)) {
    registro.aviso("[encerramento] resposta sem forma de retrato na página", pg);
    return { motivo: "resposta do Omie sem `pedidos_pesquisa`/`nTotalPaginas`" };
  }
  return { d };
}

/**
 * @param {{de: Date, ate: Date}} janela
 * @param {{flag?: string, ateMs?: number}} [opts] `flag` é o filtro do Omie; `ateMs` é o instante
 *   limite (Date.now()) — o cron reserva tempo para gravar e bater o ponto depois da coleta.
 */
export async function coletarEncerrados(janela, opts = {}) {
  const flag = opts.flag || "lExibirPedidosEncerrados";
  const ateMs = Number(opts.ateMs) || Infinity;
  const codigos = new Set();
  let paginas = 0;

  for (let pg = 1; pg <= MAX_PAGINAS; pg++) {
    // ⚠⚠ O ORÇAMENTO É CHECADO ANTES DE CADA PÁGINA. `omieCall` retenta até 6 vezes com timeout de
    // 45s cada — uma única página pode passar do `maxDuration` da rota. Morrendo por timeout, a
    // função nem chega a devolver `completa:false`: não grava nada e não bate o ponto, que é o
    // mesmo silêncio que deixou o `cmr-reconciliar` congelado em `ok:true` por 55h.
    if (Date.now() > ateMs) return { codigos, completa: false, paginas, motivo: "tempo esgotado no meio da coleta" };

    const { d, motivo } = await buscarPagina(flag, janela, pg, ateMs);
    if (!d) return { codigos, completa: false, paginas, motivo };

    paginas = pg;
    for (const ped of d.pedidos_pesquisa) {
      const cod = ped.cabecalho_consulta?.nCodPed;
      if (cod) codigos.add(String(cod));
    }
    if (pg >= Number(d.nTotalPaginas)) return { codigos, completa: true, paginas, motivo: null };
  }
  return { codigos, completa: false, paginas, motivo: `teto de ${MAX_PAGINAS} páginas atingido` };
}

/**
 * Decide, para cada pedido local, o que gravar — a regra pura, sem banco nem rede.
 *
 * ⚠ Marcar é sempre seguro; DESMARCAR só com coleta completa. É a assimetria que o Codex pediu:
 * a marca some apenas quando o portal tem certeza de ter procurado o pedido e não o achado.
 *
 * @param {{id:string, codigoPedido:string|null, encerradoOmieEm:Date|null}[]} pedidos
 * @param {{codigos:Set<string>, completa:boolean}} coleta
 * @param {Date} agora quando o portal DETECTOU (o Omie não devolve a data do encerramento)
 */
export function decidirEncerramentos(pedidos, coleta, agora = new Date()) {
  const marcar = [], candidatos = [];
  for (const p of pedidos || []) {
    if (!p.codigoPedido) continue;
    const encerradoNoOmie = coleta.codigos.has(String(p.codigoPedido));
    if (encerradoNoOmie && !p.encerradoOmieEm) marcar.push(p.id);
    // ⚠⚠ "NÃO ESTAVA NA LISTA" NÃO É "REABRIU" — é só ausência, e ausência tem muitas causas
    // inocentes (achado do Codex, 17/09/2026): a janela de datas da pesquisa é derivada do
    // `createdAt` local enquanto o Omie filtra pela data DELE; a paginação pode mudar no meio da
    // coleta; um contrato novo pode renomear um campo. Por isso o não-encontrado vira CANDIDATO, e
    // quem desmarca é `confirmarReaberturas`, com evidência positiva.
    else if (!encerradoNoOmie && p.encerradoOmieEm && coleta.completa) candidatos.push(p);
  }
  return { marcar, candidatos, em: agora };
}

/**
 * Dos candidatos, quais REALMENTE reabriram — os que o Omie devolve como pendentes.
 *
 * ⚠⚠ EVIDÊNCIA POSITIVA, NÃO AUSÊNCIA. Desmarcar é a operação perigosa: devolve o pedido para a
 * fila de cobrança de prazo, e em massa (33 de uma vez) seria um estrago silencioso. Marcar erra
 * para o lado barato; desmarcar, não. Então só desmarca quem APARECE na pesquisa de pendentes.
 *
 * ⚠ Quem não aparece em lugar nenhum fica como `indefinidos`: mantém a marca e é REPORTADO. Um
 * pedido reaberto como "recebido parcial" cairia aqui — a marca sobrevive até alguém olhar, o que
 * é melhor que desmarcar 33 por causa de uma resposta torta.
 *
 * ⚠ Não custa nada no caso normal: `candidatos` é vazio quase sempre, e aí nem consulta o Omie.
 *
 * ⚠ `opts.coletar` existe para o teste injetar a coleta — mesmo padrão do `lerFonte` em
 * `prepararOpConferida`. Espionar o módulo não funcionaria: a chamada interna não passa pelo
 * objeto de namespace do ESM, então o espião nunca seria consultado e o teste passaria em falso.
 */
export async function confirmarReaberturas(candidatos, janela, opts = {}) {
  if (!candidatos?.length) return { desmarcar: [], indefinidos: [], consultou: false };
  const coletar = opts.coletar || coletarEncerrados;
  const pendentes = await coletar(janela, { ...opts, flag: "lExibirPedidosPendentes" });
  if (!pendentes.completa) {
    return { desmarcar: [], indefinidos: candidatos.map((p) => p.id), consultou: true, motivo: pendentes.motivo };
  }
  const desmarcar = [], indefinidos = [];
  for (const p of candidatos) {
    (pendentes.codigos.has(String(p.codigoPedido)) ? desmarcar : indefinidos).push(p.id);
  }
  return { desmarcar, indefinidos, consultou: true, motivo: null };
}

/**
 * Reconcilia a marca de encerramento de todos os pedidos do portal contra o Omie.
 *
 * ⚠ Varre TODOS os pedidos com código, sem o corte de 12 meses do `syncEntregas` — a tela de
 * Prazos não tem esse corte, e pedido antigo encerrado é justamente o que fica encalhado em
 * vermelho. São 284 linhas de um `select` de três campos; o custo está na rede do Omie, e essa é
 * a mesma varredura de ~8 páginas para qualquer tamanho de lista.
 */
/**
 * Uma reconciliação por vez.
 *
 * ⚠ A exclusão mora em `lib/cron-trava.js`, e vale a pena ler o porquê lá: a primeira tentativa foi
 * `pg_try_advisory_lock` e ela NÃO funcionou — duas chamadas simultâneas passaram as duas, porque
 * trava consultiva é de sessão e o pool entrega conexões diferentes.
 */
export async function reconciliarEncerramentos(prisma, opts = {}) {
  const r = await comTravaDeCron(prisma, "omie-encerrados", () => reconciliarSemTrava(prisma, opts));
  // ⚠ Pular NÃO é falha: é a trava funcionando. Mas tem de aparecer no heartbeat, senão uma
  // execução que nunca roda por estar sempre pulando vira silêncio com cara de sucesso.
  return r || { total: 0, marcados: 0, desmarcados: 0, indefinidos: 0, completa: true, motivo: null, pulou: true };
}

async function reconciliarSemTrava(prisma, opts = {}) {
  const pedidos = await prisma.pedidoOmie.findMany({
    where: { codigoPedido: { not: null }, status: { notIn: ["REVERTIDO", "ERRO"] } },
    select: { id: true, codigoPedido: true, encerradoOmieEm: true, createdAt: true },
  });
  if (pedidos.length === 0) return { total: 0, marcados: 0, desmarcados: 0, indefinidos: 0, completa: true, motivo: null };

  const janela = janelaDaColeta(pedidos.map((p) => p.createdAt));
  // ⚠ Reserva de tempo para GRAVAR e bater o ponto depois da coleta: sem isso o cron morre no
  // meio da rede e a rodada some do heartbeat, que foi o defeito do `cmr-reconciliar`.
  const ateMs = Number(opts.ateMs) || Infinity;
  const coleta = await coletarEncerrados(janela, { ateMs });
  const { marcar, candidatos, em } = decidirEncerramentos(pedidos, coleta);
  const reabertura = await confirmarReaberturas(candidatos, janela, { ateMs });

  // ⚠ A gravação repete a condição que foi LIDA (`encerradoOmieEm` nulo para marcar, não-nulo para
  // desmarcar). Com a trava isso é cinto e suspensório — mas é barato, e protege o caminho em que
  // alguém mexe na coluna por fora enquanto a coleta acontece.
  if (marcar.length) {
    await prisma.pedidoOmie.updateMany({
      where: { id: { in: marcar }, encerradoOmieEm: null }, data: { encerradoOmieEm: em },
    });
  }
  if (reabertura.desmarcar.length) {
    await prisma.pedidoOmie.updateMany({
      where: { id: { in: reabertura.desmarcar }, encerradoOmieEm: { not: null } }, data: { encerradoOmieEm: null },
    });
  }
  return {
    total: pedidos.length,
    marcados: marcar.length,
    desmarcados: reabertura.desmarcar.length,
    // ⚠ Candidato que ninguém confirmou MANTÉM a marca e aparece aqui. Silenciar viraria o mesmo
    // buraco de antes, só que pelo outro lado.
    indefinidos: reabertura.indefinidos.length,
    encerradosNoOmie: coleta.codigos.size,
    // ⚠⚠ SÃO DUAS COLETAS, E AS DUAS CONTAM (achado do Codex, 17/09/2026). Antes `completa`
    // olhava só a primeira: a confirmação de reaberturas podendo parar por tempo, a rodada se
    // anunciava "completa" com `motivo` preenchido — e quem lê o estado, não o motivo, tomava
    // uma coleta pela metade por retrato inteiro.
    completa: coleta.completa && !reabertura.motivo,
    motivo: coleta.motivo || reabertura.motivo || null,
  };
}
