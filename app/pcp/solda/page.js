// Programação de Solda no PCP — mesma tela do portal da produção, sem sair do módulo PCP.
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import SetorClient from "@/app/producao/programacao/SetorClient";

export const metadata = { title: "Workspace Torg — PCP · Solda" };
export const dynamic = "force-dynamic";

export default async function PcpSetor() {
  await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]);

  const pecas = await prisma.pecaConjunto.findMany({
    where: { tipoPeca: "CONJUNTO", status: { in: ["SOLDA", "ACABAMENTO"] } },
    orderBy: [{ opNumero: "asc" }, { marca: "asc" }],
    include: {
      op: { select: { id: true, numero: true, cliente: true, obra: true } },
      conjuntoCroquis: {
        include: {
          croqui: { select: { id: true, marca: true, descricao: true, qte: true, qteProduzida: true, status: true } },
        },
      },
    },
    take: 3000,
  });

  return (
    <SetorClient
      pecasIniciais={JSON.parse(JSON.stringify(pecas))}
      setorAtual="SOLDA"
      setorAnterior="MONTAGEM"
      setorProximo="ACABAMENTO"
      titulo="Programação de Solda"
      iconColor="text-orange-500"
      codigoDoc="REL-PRD-005"
    />
  );
}
