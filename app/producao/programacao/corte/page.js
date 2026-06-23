import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import ProgramacaoCorteClient from "./ProgramacaoCorteClient";

export const metadata = {
  title: "Workspace Torg — Programação · Corte",
};

export default async function ProgramacaoCorte() {
  const user = await requireRole(["ADMIN", "COMERCIAL", "COMPRAS", "PRODUCAO"]);

  const [pecas, ops] = await Promise.all([
    prisma.pecaConjunto.findMany({
      // só peças LPC ainda em produção (expedidas não se programam no corte) —
      // mantém o conjunto enxuto e evita truncar OPs novas pelo limite.
      where: { fonte: "LPC_IMPORT", status: { not: "EXPEDIDO" } },
      orderBy: [{ opNumero: "asc" }, { marca: "asc" }],
      include: { op: { select: { id: true, numero: true, cliente: true, obra: true } } },
      take: 15000,
    }),
    prisma.oP.findMany({
      where: { status: { notIn: ["ENCERRADA", "CANCELADA"] } },
      select: { id: true, numero: true, cliente: true, obra: true },
      orderBy: { numero: "desc" },
    }),
  ]);

  return (
    <ProgramacaoCorteClient
      pecasIniciais={JSON.parse(JSON.stringify(pecas))}
      ops={ops}
      userRole={user.role}
    />
  );
}
