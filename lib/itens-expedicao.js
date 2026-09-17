import "server-only";

// ─── O QUE A OBRA EXPEDE ──────────────────────────────────────────────────────
//
// Uma pergunta só, com duas telas dependendo dela: as etiquetas de carregamento e a conferência de
// peça. Vale ler POR QUE ela não é uma linha de `where`.
//
// ⚠⚠ QUEM DEFINE A LISTA É A LISTA DE EXPEDIÇÃO. Matheus (08/09/2026): "acredito que só deve
// considerar a L.E e não incluir LPC junto para não duplicar".
//
// `PecaConjunto` guarda a obra INTEIRA — o conjunto que sobe no caminhão e as posições que o
// compõem, vindas de importadores diferentes. Usá-la como ponto de partida foi a origem de todos os
// defeitos desta tela: posições na lista, a mesma marca três vezes, o perfil no lugar do nome da
// peça, quantidade de uma linha desalinhada. Aqui a ordem é a inversa:
//
//   1. a L.E. diz QUAIS marcas existem e QUANTAS peças cada uma tem;
//   2. `PecaConjunto` só COMPLETA o que a L.E. não traz (o peso, e o id para casar registros).
//
// Uma linha de LPC nunca entra na lista por si — no máximo completa uma marca que a L.E. já
// nomeou. É o que impede a duplicação de voltar por outro caminho.

/** "097" e "97" são a MESMA obra em tabelas diferentes: OP.numero vem com zero, a LE nem sempre. */
export const semZero = (n) => String(n ?? "").trim().replace(/^0+/, "");

/** A marca como chave de comparação — o que vem do teclado do celular não vem arrumado. */
export const chaveMarca = (m) => String(m ?? "").trim().toUpperCase();

const positivo = (n) => (Number(n) > 0 ? Number(n) : null);

/**
 * ⚠⚠ LINHA DE TOTAL DA PLANILHA IMPORTADA COMO SE FOSSE PEÇA. O importador da L.E. engoliu o
 * rodapé "TOTAL.:" da planilha e criou uma marca com esse nome — em 4 obras (060, 067, 085, 089), a
 * da OP-89 com `qte` 8705. Ela aparecia nas duas telas, e dava para mandar imprimir 8.705 etiquetas
 * de uma peça que não existe.
 *
 * Filtrar aqui trata o sintoma nas duas telas de uma vez; consertar o importador e limpar as 4
 * linhas é serviço à parte.
 */
// ⚠ A regra passou a morar em `lib/linha-de-total.js` (17/09/2026) — o parser precisava dela e este
// módulo é `server-only`. Importada E reexportada: este arquivo também a usa, e um `export ... from`
// sozinho não traz o nome para o escopo daqui (quem pegou foi o `npm run checar`).
import { ehLinhaDeTotal } from "./linha-de-total";
export { ehLinhaDeTotal };

/**
 * ⚠⚠ EXISTEM DOIS IMPORTADORES DA MESMA L.E., E NENHUM COBRE TODAS AS OBRAS. O da Expedição traz a
 * planilha do SharePoint para a tabela `ListaExpedicao`; o da Produção
 * (`/api/producao/pecas/importar-le`) carimba `naLE` na peça. A OP-118 só tem o segundo e a OP-101
 * só tem o primeiro — olhar uma fonte só faz obra inteira sumir da tela.
 *
 * A PLANILHA TEM PRECEDÊNCIA quando as duas existem, porque ela É o documento. Na OP-89 as linhas
 * de `PecaConjunto` importadas sob a chave "89" estão DESLOCADAS EM UMA POSIÇÃO em relação às sob
 * "089" — T89-AC13 tem 20 numa e 55 na outra; a planilha bate com a segunda. São 17 marcas com
 * quantidade errada, e as duas linhas são `LE_IMPORT`: nenhuma regra de "escolher a linha" resolve.
 */
export async function marcasDaListaExpedicao(prisma, op) {
  const listas = await prisma.listaExpedicao.findMany({
    where: { OR: [{ opId: op.id }, { opNumero: { in: [op.numero, semZero(op.numero)].filter(Boolean) } }] },
    select: { marcasJson: true },
  });
  const mapa = new Map();
  for (const l of listas)
    for (const m of Array.isArray(l.marcasJson) ? l.marcasJson : []) {
      if (!m?.marca || ehLinhaDeTotal(m.marca)) continue;
      // ⚠ a MESMA marca pode vir em mais de uma frente (T64A, T64B…): é a mesma peça listada duas
      // vezes, não duas peças. Somar aqui inflaria o previsto — mesma regra de /api/expedicao/listas.
      const k = chaveMarca(m.marca);
      if (mapa.has(k)) continue;
      mapa.set(k, {
        marca: String(m.marca).trim(),
        qte: positivo(m.qte),
        descricao: m.descricao || "",
        pesoUnitKg: positivo(m.pesoUnit),
      });
    }
  // ⚠⚠ `temListaImportada` É UM FATO SEPARADO DO TAMANHO (pedido do Codex, 14/09/2026). Inferir a
  // existência de `mapa.size > 0` faria uma lista importada VAZIA — parser que falhou, planilha em
  // branco — cair no caminho de "obra sem planilha" e RESSUSCITAR o cadastro inteiro. O silêncio da
  // planilha não pode virar permissão para o carimbo velho voltar a mandar.
  return { temListaImportada: listas.length > 0, marcas: mapa };
}

/**
 * A linha de `PecaConjunto` que COMPLETA uma marca da L.E.
 *
 * ⚠ Prefere a que veio do importador da L.E.; uma linha de LPC serve só para o que a L.E. não
 * trouxer (o peso, tipicamente), nunca para dizer o que a marca é. A do LPC guarda o PERFIL na
 * descrição ("L1.1/2''X1/8''") e a da L.E. guarda o NOME da peça ("CONTRAVENTAMENTO") — e é o nome
 * que sai impresso na etiqueta colada nela.
 */
function melhorLinha(linhas) {
  return linhas.find((l) => l.naLE && l.fonte === "LE_IMPORT")
    || linhas.find((l) => l.naLE)
    || linhas[0];
}

/** O primeiro valor preenchido — a L.E. na frente, o cadastro atrás, e um padrão no fim. */
const primeiro = (...vs) => vs.find((v) => v !== null && v !== undefined && v !== "");

/** O item como as duas telas consomem: a L.E. manda, o cadastro completa os buracos. */
function montarItem({ chave, daPlanilha, linhas }) {
  const linha = linhas.length ? melhorLinha(linhas) : null;
  return {
    // ⚠ A GRAFIA vem do CADASTRO quando ele tem a marca — é a forma registrada, e a planilha às
    // vezes traz espaço ou caixa diferente. Só o CONTEÚDO (quantidade, descrição) é que a L.E.
    // manda; como a marca é escrita não muda o que ela é.
    marca: primeiro(linha?.marca, daPlanilha?.marca, chave),
    descricao: primeiro(daPlanilha?.descricao, linha?.descricao, ""),
    qte: primeiro(daPlanilha?.qte, positivo(linha?.qte), 1),
    pesoUnitKg: primeiro(daPlanilha?.pesoUnitKg, positivo(linha?.pesoUnitKg), 0),
    // `id` é a linha do cadastro, quando existe; `ids`, todas as cópias dela. Quem casa registro
    // por id precisa das três — ver `historicoDaMarca` na rota das etiquetas.
    id: linha?.id ?? null,
    ids: linhas.map((l) => l.id),
    naPlanilha: !!daPlanilha,
  };
}

/**
 * As peças expedíveis de uma OP: uma linha por MARCA, definida pela Lista de Expedição.
 * @returns {Promise<{op:object, pecas:object[]}|null>} null quando a OP não existe
 */
export async function itensExpediveisDaOP(prisma, opId) {
  const op = await prisma.oP.findUnique({
    where: { id: opId },
    select: { id: true, numero: true, cliente: true, obra: true },
  });
  if (!op) return null;

  const [cadastro, planilha] = await Promise.all([
    prisma.pecaConjunto.findMany({
      where: { opId },
      select: { id: true, marca: true, descricao: true, qte: true, pesoUnitKg: true, naLE: true, fonte: true },
      orderBy: [{ marca: "asc" }],
    }),
    marcasDaListaExpedicao(prisma, op),
  ]);

  const porMarca = new Map();
  for (const p of cadastro) {
    if (ehLinhaDeTotal(p.marca)) continue;
    const k = chaveMarca(p.marca);
    if (!porMarca.has(k)) porMarca.set(k, []);
    porMarca.get(k).push(p);
  }

  // ⚠⚠ QUANDO A PLANILHA EXISTE, ELA DEFINE SOZINHA QUAIS MARCAS EXISTEM. Até 14/09/2026 o
  // cadastro podia ACRESCENTAR marcas pelo carimbo `naLE`, e esse carimbo é um retrato do dia em
  // que o importador da Produção rodou — ninguém o limpa quando a engenharia revisa a lista.
  //
  // Provado na OP-105: a revisão R02 EXCLUIU a marca `105A92` (o próprio `ListaExpedicaoRevisao`
  // registra a exclusão), a planilha importada ficou com 102 marcas, e a tela seguia mostrando 103
  // — dava para imprimir etiqueta de uma peça que a L.E. vigente não lista mais, e a Conferência de
  // Peça aceitava conferi-la. Medido em toda a base: 33 marcas em 4 obras nessa situação.
  //
  // ⚠ O FALLBACK CONTINUA, e ele é a razão de o carimbo existir: obra cuja planilha NUNCA foi
  // importada (a OP-118) só tem o cadastro. O que mudou é que ele deixou de valer quando há
  // planilha — não é mais "as duas fontes somam", é "a planilha manda, o cadastro completa".
  const chaves = new Set(planilha.marcas.keys());
  if (!planilha.temListaImportada) {
    for (const [k, linhas] of porMarca) if (linhas.some((l) => l.naLE)) chaves.add(k);
  }

  const pecas = [...chaves]
    .map((chave) => montarItem({ chave, daPlanilha: planilha.marcas.get(chave), linhas: porMarca.get(chave) || [] }))
    .sort((a, b) => a.marca.localeCompare(b.marca, "pt-BR", { numeric: true }));

  return { op, pecas };
}

/**
 * As OBRAS que têm o que expedir, com uma noção do tamanho.
 *
 * ⚠⚠ O NÚMERO DO SELETOR SEGUE A MESMA REGRA DO DETALHE (achado do Codex, 14/09/2026). Ele era o
 * MÁXIMO entre cadastro e planilha — e assim que a planilha passou a mandar sozinha, o seletor
 * diria "103 marcas" numa obra que abre com 102. Número que muda ao abrir a tela é o tipo de
 * divergência que faz duvidar das duas telas.
 *
 * ⚠ Havendo planilha, o cadastro NÃO levanta o número: a soma é das listas da obra (uma por
 * frente). Obra com várias frentes ainda pode contar a mais quando a MESMA marca aparece em duas
 * delas — o detalhe deduplica, esta contagem não, porque ler o `marcasJson` de 33 obras só para
 * rotular um <select> puxaria alguns MB do Neon a cada abertura da tela. É ordem de grandeza, e o
 * número exato sai quando a OP abre.
 */
export async function opsComItensExpediveis(prisma) {
  const [comLE, listas, ops] = await Promise.all([
    // ⚠ por (opId, marca), não só por opId: a mesma marca tem até três linhas na mesma obra, e
    // contar linhas dizia "809 marcas" numa obra que tem 284.
    prisma.pecaConjunto.groupBy({ by: ["opId", "marca"], where: { naLE: true }, _count: { _all: true } }),
    prisma.listaExpedicao.findMany({ select: { opId: true, opNumero: true, marcas: true } }),
    prisma.oP.findMany({
      select: { id: true, numero: true, cliente: true, obra: true },
      orderBy: { numero: "desc" },
    }),
  ]);

  const doCadastro = new Map();
  for (const c of comLE) if (!ehLinhaDeTotal(c.marca)) doCadastro.set(c.opId, (doCadastro.get(c.opId) || 0) + 1);

  const daPlanilhaPorId = new Map();
  const daPlanilhaPorNumero = new Map();
  for (const l of listas) {
    if (l.opId) daPlanilhaPorId.set(l.opId, (daPlanilhaPorId.get(l.opId) || 0) + l.marcas);
    const n = semZero(l.opNumero);
    if (n) daPlanilhaPorNumero.set(n, (daPlanilhaPorNumero.get(n) || 0) + l.marcas);
  }

  return ops
    .map((o) => {
      const daPlanilha = daPlanilhaPorId.get(o.id) ?? daPlanilhaPorNumero.get(semZero(o.numero));
      return { ...o, marcas: daPlanilha ?? (doCadastro.get(o.id) || 0) };
    })
    .filter((o) => o.marcas > 0);
}
