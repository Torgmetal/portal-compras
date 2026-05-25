import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import ControleClient from "./ControleClient";


export const metadata = {
  title: "Workspace Torg — Controle de Produção",
};

export default async function ControleProducaoPage() {
  const user = await requireRole(["ADMIN", "COMERCIAL", "COMPRAS", "PRODUCAO"]);

  // OPs ativas (pra dropdown do seletor de peças)
  const opsRaw = await prisma.oP.findMany({
    where: { status: { notIn: ["ENCERRADA", "CANCELADA"] } },
    select: { id: true, numero: true, cliente: true },
  });
  const ops = opsRaw.sort((a, b) =>
    (a.numero || "").localeCompare(b.numero || "", undefined, { numeric: true, sensitivity: "base" })
  );

  // Peças disponíveis (não expedidas) pra planejamento
  const pecas = await prisma.pecaConjunto.findMany({
    where: { status: { not: "EXPEDIDO" } },
    select: {
      id: true, opNumero: true, marca: true, descricao: true, qte: true,
      pesoUnitKg: true, pesoTotalKg: true, status: true, fluxoEspecial: true,
    },
    orderBy: [{ opNumero: "asc" }, { marca: "asc" }],
    take: 5000,
  });

  return (
    <ControleClient
      ops={ops}
      pecasDisponiveis={JSON.parse(JSON.stringify(pecas))}
      userRole={user.role}
      isAdmin={user.role === "ADMIN"}
    />
  );
}
