// Planejamento › Montagem — o planejamento marca QUANDO cada conjunto começa a ser montado.
//
// Vitor (01/09/2026): "sobre os conjuntos será liberado pelo planejamento tbm, precisamos criar uma
// espécie de aba para selecionar a montagem, isso será necessário para trazer os conjuntos da obra,
// e o planejamento programa de acordo com o tempo da preparação a data que deverá iniciar a
// montagem".
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { produzidoPorMarca } from "@/lib/conjuntos-setor";
import { OP_VIVA } from "@/lib/op-viva";
import MontagemPlanejamentoClient from "./MontagemPlanejamentoClient";

export const metadata = { title: "Workspace Torg — Planejamento · Montagem" };
export const dynamic = "force-dynamic";

export default async function PlanejamentoMontagem() {
  await requireRole(["ADMIN", "PLANEJAMENTO", "PCP"]);

  // ⚠ o croqui vem junto: é a prontidão dele que decide se o conjunto pode ser programado.
  const conjuntos = await prisma.pecaConjunto.findMany({
    where: { tipoPeca: "CONJUNTO", ...OP_VIVA },
    orderBy: [{ opNumero: "asc" }, { marca: "asc" }],
    select: {
      id: true, opNumero: true, marca: true, descricao: true, qte: true, pesoTotalKg: true, status: true,
      montagemDiaProgramado: true, montagemDiaOriginal: true, montagemAdiado: true, montagemProgramadaPor: true,
      op: { select: { numero: true, cliente: true, obra: true } },
      conjuntoCroquis: {
        select: { croqui: { select: { marca: true, qte: true, qteProduzida: true, status: true } } },
      },
    },
    take: 4000,
  });

  // "montado" = apontamento do Syneco no setor Montagem (é o lançamento de concluído da fábrica)
  const montados = await produzidoPorMarca("Montagem", conjuntos.map((c) => c.marca));

  return (
    <MontagemPlanejamentoClient
      conjuntosIniciais={JSON.parse(JSON.stringify(conjuntos))}
      montados={montados}
    />
  );
}
