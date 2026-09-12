import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import QualidadeProducaoClient from "./QualidadeProducaoClient";
export const dynamic = "force-dynamic";
export const metadata = { title: "Produção — Qualidade por OP" };
export default async function Page() {
 await requireRole(["ADMIN", "PRODUCAO", "PCP", "PLANEJAMENTO", "QUALIDADE"]);
 const ops = await prisma.oP.findMany({ where: { status: { notIn: ["ENCERRADA", "CANCELADA"] } }, select: { id: true, numero: true, cliente: true }, orderBy: { numero: "desc" } });
 return <QualidadeProducaoClient ops={ops}/>;
}
