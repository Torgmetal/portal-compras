import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import MontagemClient from "./MontagemClient";

export const metadata = { title: "Workspace Torg — Programação · Montagem" };

export default async function ProgramacaoMontagem() {
  const user = await requireRole(["ADMIN", "PRODUCAO", "COMERCIAL"]);

  // Buscar todos os CONJUNTOs com seus croquis (relações)
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
