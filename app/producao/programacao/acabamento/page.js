import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import SetorClient from "../SetorClient";
import { Sparkles } from "lucide-react";

export const metadata = { title: "Workspace Torg — Programação · Acabamento" };

export default async function ProgramacaoAcabamento() {
  await requireRole(["ADMIN", "PRODUCAO", "COMERCIAL"]);

  const pecas = await prisma.pecaConjunto.findMany({
    where: { tipoPeca: "CONJUNTO", status: { in: ["ACABAMENTO", "JATO"] } },
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
      setorAtual="ACABAMENTO"
      setorAnterior="SOLDA"
      setorProximo="JATO"
      titulo="Programação de Acabamento"
      icon={Sparkles}
      iconColor="text-purple-500"
      codigoDoc="REL-PRD-006"
    />
  );
}
