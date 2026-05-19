import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import PecasClient from "./PecasClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Workspace Torg — Controle de Peças",
};

export default async function PainelPecas() {
  const user = await requireRole(["ADMIN", "COMERCIAL", "COMPRAS", "PRODUCAO"]);

  // OPs ativas (pra dropdown de importacao)
  const opsRaw = await prisma.oP.findMany({
    where: { status: { notIn: ["ENCERRADA", "CANCELADA"] } },
    select: { id: true, numero: true, cliente: true, obra: true },
  });
  const ops = opsRaw.sort((a, b) =>
    (a.numero || "").localeCompare(b.numero || "", undefined, { numeric: true, sensitivity: "base" })
  );

  // Lista de pecas
  const pecas = await prisma.pecaConjunto.findMany({
    orderBy: [{ opNumero: "asc" }, { item: "asc" }, { marca: "asc" }],
    include: { op: { select: { id: true, numero: true, cliente: true } } },
    take: 5000,
  });

  return (
    <PecasClient
      ops={ops}
      pecasIniciais={JSON.parse(JSON.stringify(pecas))}
      userRole={user.role}
    />
  );
}
