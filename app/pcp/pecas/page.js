import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import PecasClient from "@/app/producao/pecas/PecasClient";

export const metadata = {
  title: "Workspace Torg — PCP Peças / LPC",
};

export default async function PCPPecasPage() {
  const user = await requireRole(["ADMIN", "PLANEJAMENTO", "PRODUCAO"]);

  const opsRaw = await prisma.oP.findMany({
    where: { status: { notIn: ["ENCERRADA", "CANCELADA"] } },
    select: { id: true, numero: true, cliente: true, obra: true },
  });
  const ops = opsRaw.sort((a, b) =>
    (a.numero || "").localeCompare(b.numero || "", undefined, { numeric: true, sensitivity: "base" })
  );

  const pecas = await prisma.pecaConjunto.findMany({
    orderBy: [{ opNumero: "asc" }, { item: "asc" }, { marca: "asc" }],
    include: { op: { select: { id: true, numero: true, cliente: true } } },
    take: 5000,
  });

  return (
    <PecasClient
      ops={ops}
      pecasIniciais={JSON.parse(JSON.stringify(pecas))}
      userRole={user.tipo === "ADMIN" ? "ADMIN" : "PRODUCAO"}
    />
  );
}
