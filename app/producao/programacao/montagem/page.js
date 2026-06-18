import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { produzidoPorMarca } from "@/lib/conjuntos-setor";
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

  // "Feito" na montagem = produzido no Syneco (setor Montagem) por marca de conjunto.
  const apontamentos = await produzidoPorMarca("Montagem", conjuntos.map((c) => c.marca));

  return (
    <MontagemClient
      conjuntosIniciais={JSON.parse(JSON.stringify(conjuntos))}
      apontamentos={apontamentos}
      userRole={user.role}
    />
  );
}
