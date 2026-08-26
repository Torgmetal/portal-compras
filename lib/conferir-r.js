import "server-only";
import { prisma } from "./prisma";

// ─── O CROQUI E O CONJUNTO TÊM DE DIZER O MESMO R ─────────────────────────────
// Vitor (26/08/2026): "no data book não podemos informar um R no croqui e outro no conjunto".
//
// ⚠ A FUNÇÃO COMPARTILHADA (rCanonico) RESOLVE O MESMO INSTANTE, NÃO O TEMPO. Croqui e conjunto
// emitidos AGORA saem iguais por construção. Mas o Data Book guarda o PDF de cada um, e eles são
// emitidos em dias diferentes: se entre um e outro nascer uma amarração de R, chegar material novo
// ou mudar o FIFO, o croqui de segunda e o conjunto de quinta discordam — e os dois estão na §02.
//
// Aconteceu hoje mesmo: antes de o Z da OP-105 ser amarrado ao R 261272, qualquer croqui emitido
// saía "sem R"; depois, o conjunto sairia com o R. Dois papéis, duas verdades, o mesmo aço.
//
// ⚠ AVISA, NÃO BLOQUEIA. A divergência pode ser legítima (o croqui velho é que está errado, e
// reemitir resolve) — quem decide é quem está olhando. O que não pode é ninguém saber.
export async function conferirRComCroquis(opNumero, itens) {
  const marcas = (itens || []).map((i) => String(i?.marca || "").trim()).filter(Boolean);
  if (!marcas.length) return [];

  const grds = await prisma.grdLiberacao
    .findMany({
      where: { opNumero: String(opNumero), marca: { in: marcas } },
      orderBy: { ultimaImpressaoEm: "desc" },
      select: { marca: true, rastreio: true, ultimaImpressaoEm: true, createdAt: true },
    })
    .catch(() => []);
  if (!grds.length) return [];

  // o R que ficou no papel do croqui (o mais recente de cada marca)
  const noPapel = new Map();
  for (const g of grds) {
    const k = String(g.marca).trim().toUpperCase();
    if (noPapel.has(k)) continue;
    const r = (Array.isArray(g.rastreio) ? g.rastreio : [])
      .flatMap((i) => (i?.usadas || []).map((u) => u?.rastreio)).find(Boolean) || null;
    noPapel.set(k, { r, em: g.ultimaImpressaoEm || g.createdAt });
  }

  const divergem = [];
  for (const it of itens || []) {
    const k = String(it?.marca || "").trim().toUpperCase();
    const agora = (it?.usadas || []).map((u) => u?.rastreio).find(Boolean) || null;
    const antes = noPapel.get(k);
    if (!antes || !antes.r || !agora) continue;   // sem os dois lados não há o que comparar
    if (String(antes.r) !== String(agora)) {
      divergem.push({
        marca: it.marca, noCroqui: antes.r, noConjunto: agora,
        croquiEm: antes.em ? antes.em.toISOString() : null,
      });
    }
  }
  return divergem;
}
