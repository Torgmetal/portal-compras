// Peças / Corte dentro do módulo PCP — mesma tela de liberação usada pela
// Produção (/producao/programacao/corte), mas sem sair do painel do PCP.
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import ProgramacaoCorteClient from "@/app/producao/programacao/corte/ProgramacaoCorteClient";

export const metadata = { title: "Workspace Torg — PCP · Peças / Corte" };
export const dynamic = "force-dynamic";

export default async function PcpPecasCorte() {
  const user = await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]);

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
