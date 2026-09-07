// Montagem no PCP — mesma tela de conjuntos da Produção (prontidão por croqui,
// liberação para montagem), sem sair do módulo PCP.
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { produzidoPorMarca } from "@/lib/conjuntos-setor";
import { lerProduzidoPorSetor } from "@/lib/produzido-setor";
import MontagemClient from "@/app/producao/programacao/montagem/MontagemClient";
import { CONJUNTO_MONTAVEL } from "@/lib/prontidao-conjunto";
import { OP_VIVA } from "@/lib/op-viva";

export const metadata = { title: "Workspace Torg — PCP · Montagem" };
export const dynamic = "force-dynamic";

export default async function PcpMontagem() {
  const user = await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]);

  // Conjuntos com seus croquis (relações) — mesma consulta da tela da Produção
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

  // ⚠⚠ SETOR POSTERIOR PROVA A MONTAGEM. Vitor (07/09/2026): "de todas essas marcas que você está
  // dizendo que estão em aberto na montagem, tem alguma delas apontada em outro setor?". Tinha —
  // 139 conjuntos (5.740 kg, 137 deles da OP-067) apontados em solda, acabamento, jato ou pintura.
  // Se a peça foi SOLDADA, ela foi montada: o que faltou foi apontar a montagem, não montar. Sem
  // este corte a tela cobra trabalho que a fábrica já fez.
  const adiante = await lerProduzidoPorSetor(
    conjuntos.map((c) => ({ opId: c.opId, marca: c.marca })),
    ["SOLDA", "ACABAMENTO", "JATO", "PINTURA"],
  );
  const emAberto = conjuntos.filter(
    (c) => !["SOLDA", "ACABAMENTO", "JATO", "PINTURA"].some((s) => adiante({ opId: c.opId, marca: c.marca }, s) > 0),
  );

  return (
    <MontagemClient
      conjuntosIniciais={JSON.parse(JSON.stringify(emAberto))}
      apontamentos={apontamentos}
      userRole={user.role}
    />
  );
}
