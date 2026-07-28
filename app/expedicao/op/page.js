import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import ExpedicaoOpClient from "./ExpedicaoOpClient";

export const metadata = {
  title: "Workspace Torg — Expedição por OP",
  description: "Lista de expedição por OP: previsto × expedido e geração de romaneios.",
};

export default async function ExpedicaoOpPage() {
  await requireRole(["ADMIN", "EXPEDICAO", "PRODUCAO", "COMERCIAL", "PLANEJAMENTO", "PCP", "ENGENHARIA"]);

  const ops = await prisma.oP.findMany({
    where: { status: { notIn: ["ENCERRADA", "CANCELADA"] } },
    select: { id: true, numero: true, cliente: true, obra: true },
    orderBy: { numero: "desc" },
  });

  return <ExpedicaoOpClient ops={JSON.parse(JSON.stringify(ops))} />;
}
