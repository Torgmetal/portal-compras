// Programação de Pintura no PCP — mesma tela do portal da produção, sem sair do módulo PCP.
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import SetorClient from "@/app/producao/programacao/SetorClient";

export const metadata = { title: "Workspace Torg — PCP · Pintura" };
export const dynamic = "force-dynamic";

export default async function PcpSetor() {
  await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]);

  const pecas = await prisma.pecaConjunto.findMany({
    where: { tipoPeca: "CONJUNTO", status: { in: ["PINTURA", "EXPEDIDO"] } },
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
      setorAtual="PINTURA"
      setorAnterior="JATO"
      setorProximo="EXPEDIDO"
      titulo="Programação de Pintura"
      iconColor="text-pink-500"
      codigoDoc="REL-PRD-008"
    />
  );
}
