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
  const set = new Set();
  for (const l of listas)
    for (const m of Array.isArray(l.marcasJson) ? l.marcasJson : [])
      if (m?.marca) set.add(chaveMarca(m.marca));
  return set;
}

/**
 * As peças expedíveis de uma OP — a união das duas fontes acima.
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
      select: { id: true, marca: true, descricao: true, qte: true, naLE: true, ...(campos || {}) },
      orderBy: [{ marca: "asc" }],
    }),
    marcasDaListaExpedicao(prisma, op),
  ]);

  const pecas = todas
    .filter((p) => p.naLE || daLE.has(chaveMarca(p.marca)))
    .map(({ naLE: _naLE, ...p }) => p);
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
    prisma.pecaConjunto.groupBy({ by: ["opId"], where: { naLE: true }, _count: { _all: true } }),
    prisma.listaExpedicao.findMany({ select: { opId: true, opNumero: true, marcas: true } }),
    prisma.oP.findMany({
      select: { id: true, numero: true, cliente: true, obra: true },
      orderBy: { numero: "desc" },
    }),
  ]);

  const porId = new Map(comLE.map((c) => [c.opId, c._count._all]));
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
