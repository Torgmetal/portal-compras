import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import SetorClient from "../SetorClient";
import { Truck } from "lucide-react";

export const metadata = { title: "Workspace Torg — Programação · Expedição" };

export default async function ProgramacaoExpedicao() {
  await requireRole(["ADMIN", "PRODUCAO", "COMERCIAL"]);

  const pecas = await prisma.pecaConjunto.findMany({
    where: { tipoPeca: "CONJUNTO", status: "EXPEDIDO" },
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
      setorAtual="EXPEDIDO"
      setorAnterior="PINTURA"
      setorProximo="EXPEDIDO"
      titulo="Expedição"
      icon={Truck}
      iconColor="text-emerald-600"
      codigoDoc="REL-PRD-009"
    />
  );
}
