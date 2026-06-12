// Montagem no PCP — mesma tela de conjuntos da Produção (prontidão por croqui,
// liberação para montagem), sem sair do módulo PCP.
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import MontagemClient from "@/app/producao/programacao/montagem/MontagemClient";

export const metadata = { title: "Workspace Torg — PCP · Montagem" };
export const dynamic = "force-dynamic";

export default async function PcpMontagem() {
  const user = await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]);

  // Conjuntos com seus croquis (relações) — mesma consulta da tela da Produção
  const conjuntos = await prisma.pecaConjunto.findMany({
    where: { tipoPeca: "CONJUNTO" },
    orderBy: [{ opNumero: "asc" }, { marca: "asc" }],
    include: {
      op: { select: { id: true, numero: true, cliente: true, obra: true } },
      conjuntoCroquis: {
        include: {
          croqui: {
            select: {
              id: true,
              marca: true,
              descricao: true,
              material: true,
              qte: true,
              qteProduzida: true,
              pesoUnitKg: true,
              pesoTotalKg: true,
              comprimentoMm: true,
              status: true,
              maquina: true,
            },
          },
        },
      },
    },
    take: 3000,
  });

  return (
    <MontagemClient
      conjuntosIniciais={JSON.parse(JSON.stringify(conjuntos))}
      userRole={user.role}
    />
  );
}
