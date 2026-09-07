import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { produzidoPorMarca } from "@/lib/conjuntos-setor";
import MontagemClient from "./MontagemClient";
import { CONJUNTO_MONTAVEL } from "@/lib/prontidao-conjunto";
import { OP_VIVA } from "@/lib/op-viva";

export const metadata = { title: "Workspace Torg — Programação · Montagem" };

export default async function ProgramacaoMontagem() {
  const user = await requireRole(["ADMIN", "PRODUCAO", "COMERCIAL"]);

  // Buscar todos os CONJUNTOs com seus croquis (relações)
  const conjuntos = await prisma.pecaConjunto.findMany({
    // ⚠⚠ OP_VIVA. Vitor (07/09/2026): "as que já finalizaram tire da frente". Sem este filtro a
    // tela mostrava 3.397 conjuntos, dos quais 1.281 (38%) eram de obra ENCERRADA — a OP-078 com
    // 585 conjuntos e 131 t e a OP-064 com 468 e 72 t lideravam, as duas confirmadas como 100%
    // acabadas. Quem abria a montagem para escolher o que atacar garimpava entre obra morta.
    where: { ...CONJUNTO_MONTAVEL, ...OP_VIVA },
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
