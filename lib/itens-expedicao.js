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
export const ehLinhaDeTotal = (marca) => /^\s*(TOTAL|SUBTOTAL|SOMA)\b/i.test(String(marca ?? ""));

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
  return mapa;
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

  // ⚠⚠ O CONJUNTO DE MARCAS SAI DA L.E., NÃO DO CADASTRO. Da planilha vêm todas — inclusive as que
  // não têm linha em `PecaConjunto` (a OP-67 tem 1.519 assim, e elas não apareciam em tela nenhuma).
  // Do cadastro entram só as carimbadas `naLE`, para as obras cuja planilha nunca foi importada.
  // Linha de LPC nunca entra sozinha: é ela que trazia as posições e a duplicação.
  const chaves = new Set(planilha.keys());
  for (const [k, linhas] of porMarca) if (linhas.some((l) => l.naLE)) chaves.add(k);

  const pecas = [...chaves]
    .map((chave) => montarItem({ chave, daPlanilha: planilha.get(chave), linhas: porMarca.get(chave) || [] }))
    .sort((a, b) => a.marca.localeCompare(b.marca, "pt-BR", { numeric: true }));

  return { op, pecas };
}

/**
 * As OBRAS que têm o que expedir, com uma noção do tamanho.
 *
 * ⚠ MÁXIMO, NÃO SOMA: as duas fontes são a MESMA lista por caminhos diferentes, então somar
 * contaria a obra duas vezes. O número é ordem de grandeza — a contagem exata sai quando a OP abre,
 * que é quando ela importa.
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

  const porId = new Map();
  for (const c of comLE) if (!ehLinhaDeTotal(c.marca)) porId.set(c.opId, (porId.get(c.opId) || 0) + 1);
  const porNumero = new Map();
  for (const l of listas) {
    if (l.opId) porId.set(l.opId, Math.max(porId.get(l.opId) || 0, l.marcas));
    const n = semZero(l.opNumero);
    if (n) porNumero.set(n, (porNumero.get(n) || 0) + l.marcas);
  }

  return ops
    .map((o) => ({ ...o, marcas: Math.max(porId.get(o.id) || 0, porNumero.get(semZero(o.numero)) || 0) }))
    .filter((o) => o.marcas > 0);
}
