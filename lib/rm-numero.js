import { prisma } from "@/lib/prisma";

// Próximo número sequencial de RM Interna Torg: "RI-NNNN".
// (Engenharia usa o número do Tekla; a Interna é gerada automaticamente.)
export async function proximoNumeroInterno() {
  const internas = await prisma.rM.findMany({
    where: { numero: { startsWith: "RI-" } },
    select: { numero: true },
  });
  let maxN = 0;
  for (const r of internas) {
    const m = (r.numero || "").match(/^RI-(\d+)$/);
    if (m) maxN = Math.max(maxN, parseInt(m[1]));
  }
  return `RI-${String(maxN + 1).padStart(4, "0")}`;
}
