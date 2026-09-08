import "server-only";

// ─── O QUE A OBRA EXPEDE ──────────────────────────────────────────────────────
//
// Uma pergunta só, com duas telas dependendo dela: as etiquetas de carregamento e a conferência
// de peça. Nasceu dentro da rota das etiquetas; virou lib na segunda tela, antes de existir a
// segunda cópia — e vale a pena ler POR QUE ela não é uma linha de `where`.
//
// ⚠⚠ `PecaConjunto` GUARDA A OBRA INTEIRA, não o que sai no caminhão. O conjunto que se expede E
// as posições que o compõem moram na mesma tabela: na OP-97 são 1.236 linhas para 537 itens
// expedíveis, e as outras 699 são croquis ("T97A-P30", W150X24) — peça de fábrica, que vai soldada
// dentro de outra e nunca sai sozinha do pátio.
//
// Matheus (08/09/2026): "não pode aparecer as posições, somente os produtos finais igual sai na
// Lista de Expedição; talvez o ideal seja usar a L.E de cada obra que são realmente os itens
// expedíveis".
//
// ⚠ O FILTRO É O PERTENCIMENTO À LE, NUNCA `tipoPeca !== "CROQUI"`. A LE da OP-97 tem os parafusos
// ("T97-AC8", tipo nulo) e eles se expedem; filtrar por tipo os deixaria de fora.

/** "097" e "97" são a MESMA obra em tabelas diferentes: OP.numero vem com zero, a LE nem sempre. */
export const semZero = (n) => String(n ?? "").trim().replace(/^0+/, "");

/** A marca como chave de comparação — o que vem do teclado do celular não vem arrumado. */
export const chaveMarca = (m) => String(m ?? "").trim().toUpperCase();

/**
 * ⚠⚠ LINHA DE TOTAL DA PLANILHA IMPORTADA COMO SE FOSSE PEÇA. O importador da L.E. engoliu o
 * rodapé "TOTAL.:" da planilha e criou uma marca com esse nome — em 4 obras (060, 067, 085, 089), a
 * da OP-89 com `qte` 8705. Ela aparecia na lista de conferência e na de etiquetas, e dava para
 * mandar imprimir 8.705 etiquetas de uma peça que não existe.
 *
 * Filtrar aqui trata o sintoma nas duas telas de uma vez; consertar o importador e limpar as 4
 * linhas é serviço à parte (e não é meu para decidir sozinho).
 */
const ehLinhaDeTotal = (marca) => /^\s*(TOTAL|SUBTOTAL|SOMA)\b/i.test(String(marca ?? ""));

/**
 * As marcas da LISTA DE EXPEDIÇÃO importada (tabela `ListaExpedicao`, uma linha por frente).
 *
 * ⚠⚠ EXISTEM DOIS IMPORTADORES DA MESMA LE, E NENHUM COBRE TODAS AS OBRAS. O da Produção
 * (`/api/producao/pecas/importar-le`) carimba `naLE` na peça; o da Expedição traz a planilha do
 * SharePoint para `ListaExpedicao`. Onde os dois rodaram eles concordam (OP-89: 283 e 279, com 279
 * em comum) — mas a OP-118 só tem `naLE` e a OP-101 só tem `ListaExpedicao`. Olhar uma fonte só
 * faz obra inteira sumir da tela.
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
      mapa.set(chaveMarca(m.marca), { qte: Number(m.qte) || 0, descricao: m.descricao || "" });
    }
  return mapa;
}

/**
 * ⚠⚠ A MESMA PEÇA APARECE ATÉ TRÊS VEZES NA MESMA OBRA, e não é erro de dado: é o
 * `@@unique([opNumero, marca])` do schema. A chave é (opNumero, marca), e a MESMA OP tem várias
 * chaves de opNumero conforme quem importou — a OP-89 tem "89", "089", "T89A" e "T89C". Resultado:
 * 809 linhas para 284 marcas de verdade.
 *
 * Matheus (08/09/2026): "verifique o porquê está repetindo a mesma marca várias vezes na lista,
 * não faz sentido isso".
 *
 * ⚠ ESCOLHE UMA, NÃO SOMA. É a mesma peça vista por importadores diferentes, não três peças —
 * somar triplicaria o previsto da obra. Mesma regra já usada em `/api/expedicao/listas`
 * ("DEDUP POR MARCA entre frentes: somar cru inflaria o faltante").
 *
 * ⚠ E A LINHA QUE GANHA É A DA L.E. As cópias divergem: a do LPC traz o PERFIL na descrição
 * ("L1.1/2''X1/8''") e a da LE traz o NOME da peça ("CONTRAVENTAMENTO"); em 28 grupos a quantidade
 * também difere. Quem expede e quem etiqueta lê a Lista de Expedição, então é ela que manda —
 * é o mesmo texto que sai impresso na etiqueta colada na peça.
 */
function linhaQueVale(linhas) {
  return linhas.find((l) => l.fonte === "LE_IMPORT") || linhas[0];
}

/**
 * As peças expedíveis de uma OP — a união das duas fontes acima, uma linha por MARCA.
 *
 * Cada peça devolve `id` (a linha escolhida) e `ids` (todas as cópias daquela marca): quem precisa
 * casar registros por id — a auditoria de impressão das etiquetas, por exemplo — tem de olhar as
 * três, senão perde o histórico gravado contra a cópia que não venceu.
 *
 * @returns {Promise<{op:object, pecas:object[]}|null>} null quando a OP não existe
 */
export async function itensExpediveisDaOP(prisma, opId, { campos } = {}) {
  const op = await prisma.oP.findUnique({
    where: { id: opId },
    select: { id: true, numero: true, cliente: true, obra: true },
  });
  if (!op) return null;

  const [todas, daLE] = await Promise.all([
    prisma.pecaConjunto.findMany({
      where: { opId },
      select: { id: true, marca: true, descricao: true, qte: true, naLE: true, fonte: true, ...(campos || {}) },
      orderBy: [{ marca: "asc" }],
    }),
    marcasDaListaExpedicao(prisma, op),
  ]);

  const porMarca = new Map();
  for (const p of todas) {
    if (ehLinhaDeTotal(p.marca)) continue;
    if (!p.naLE && !daLE.has(chaveMarca(p.marca))) continue;
    const k = chaveMarca(p.marca);
    if (!porMarca.has(k)) porMarca.set(k, []);
    porMarca.get(k).push(p);
  }

  const pecas = [...porMarca.values()].map((linhas) => {
    const { naLE: _naLE, fonte: _fonte, ...escolhida } = linhaQueVale(linhas);
    const daPlanilha = daLE.get(chaveMarca(escolhida.marca));
    return {
      ...escolhida,
      // ⚠⚠ A PLANILHA DA L.E. MANDA NA QUANTIDADE, quando ela existe. Não é preferência de fonte, é
      // dado corrompido: na OP-89 as linhas de `PecaConjunto` importadas sob a chave "89" estão
      // DESLOCADAS EM UMA POSIÇÃO em relação às sob "089" — T89-AC13 tem 20 numa e 55 na outra,
      // T89-AC14 tem 55 e 3, e assim por diante; a planilha bate com a segunda. São 17 marcas com
      // quantidade errada de um jeito que nenhuma regra de "escolher a linha" resolve, porque as
      // duas linhas são LE_IMPORT. A `ListaExpedicao` é o documento em si — é ela que decide.
      ...(daPlanilha?.qte > 0 ? { qte: daPlanilha.qte } : {}),
      ...(daPlanilha?.descricao ? { descricao: daPlanilha.descricao } : {}),
      ids: linhas.map((l) => l.id),
    };
  });
  return { op, pecas };
}

/**
 * As OBRAS que têm o que expedir, com uma noção do tamanho.
 *
 * ⚠ MÁXIMO, NÃO SOMA: as duas fontes são a MESMA lista importada por caminhos diferentes, então
 * somar contaria a obra duas vezes. O número aqui é só ordem de grandeza — a contagem exata sai
 * quando a OP abre, que é quando ela importa.
 */
export async function opsComItensExpediveis(prisma) {
  const [comLE, listas, ops] = await Promise.all([
    // ⚠ por (opId, marca), não só por opId: a mesma marca tem até três linhas na mesma obra (ver
    // `linhaQueVale`), e contar linhas dizia "809 marcas" numa obra que tem 284.
    prisma.pecaConjunto.groupBy({ by: ["opId", "marca"], where: { naLE: true }, _count: { _all: true } }),
    prisma.listaExpedicao.findMany({ select: { opId: true, opNumero: true, marcas: true } }),
    prisma.oP.findMany({
      select: { id: true, numero: true, cliente: true, obra: true },
      orderBy: { numero: "desc" },
    }),
  ]);

  const porId = new Map();
  for (const c of comLE) porId.set(c.opId, (porId.get(c.opId) || 0) + 1);
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
