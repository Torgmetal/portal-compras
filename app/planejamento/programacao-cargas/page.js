import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import ProgramacaoCargasPlanejamentoClient from "./ProgramacaoCargasPlanejamentoClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Planejamento — Programação de Cargas" };

export default async function ProgramacaoCargasPlanejamentoPage() {
  await requireRole(["ADMIN", "PLANEJAMENTO", "EXPEDICAO"]);

  const ops = await prisma.oP.findMany({
    where: { status: { notIn: ["ENCERRADA", "CANCELADA"] } },
    select: { id: true, numero: true, cliente: true, obra: true },
    orderBy: { numero: "desc" },
  });

  return <ProgramacaoCargasPlanejamentoClient ops={JSON.parse(JSON.stringify(ops))} />;
}
