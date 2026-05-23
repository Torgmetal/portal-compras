import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import ChecklistClient from "./ChecklistClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Checklist de Expedição — Workspace Torg",
  description: "Acompanhe o que precisa ser expedido por OP.",
};

export default async function ChecklistPage() {
  await requireRole(["ADMIN", "EXPEDICAO", "PRODUCAO", "COMERCIAL", "ENGENHARIA"]);

  const ops = await prisma.oP.findMany({
    where: { status: { notIn: ["ENCERRADA", "CANCELADA"] } },
    select: { id: true, numero: true, cliente: true, obra: true },
    orderBy: { numero: "desc" },
  });

  return <ChecklistClient ops={JSON.parse(JSON.stringify(ops))} />;
}
