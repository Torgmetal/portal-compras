// Consulta das RMs de SERVIÇO (aluguel de equipamento e medição de montagem).
//
// Existe separado do componente porque `components/PainelServicosRM.jsx` é um
// componente compartilhado por duas telas, e componente não fala com o banco —
// fala com um módulo de dados. É a fronteira que `quality/no-direct-data-access`
// guarda.
//
// ⚠⚠ A POLÍTICA DE ESCOPO E TETO É A MESMA DAS RMs DE MATERIAL (`lib/rms-painel.js`), e por isso
// vem de lá em vez de ser reescrita aqui. O que NÃO é compartilhado é o `include`: aluguel e
// montagem carregam valor de diária, dias e total, que a tela de materiais não tem.
//
// O defeito corrigido é o mesmo de 16/09/2026 nas RMs de material: `take: 100` com o filtro por
// obra rodando no navegador escondia 111 das 211 RMs e sumia com 11 obras do seletor. Aqui os
// volumes ainda são baixos (1 RM de cada tipo em 16/09/2026), então nunca estourou — mas o defeito
// estava montado e esperando o histórico crescer.
import { prisma } from "@/lib/prisma";
import { escopoRMs, obrasDoEscopo, LIMITE_SEM_OBRA } from "@/lib/rms-painel";

/**
 * @param {"ALUGUEL"|"MONTAGEM"} tipo
 * @param {boolean} verArquivadas  histórico em vez das RMs em andamento
 * @param {string|null} opNumero   obra escolhida; null = todas (aí vale o teto)
 * @returns {Promise<{rms:any[], statusCount:Record<string,number>, obras:any[],
 *                    total:number, truncada:boolean}>}
 */
export async function buscarRMsDeServico(tipo, verArquivadas, opNumero = null) {
  const escopo = escopoRMs(tipo, verArquivadas);
  const where = opNumero ? { ...escopo, op: { numero: opNumero } } : escopo;

  const [rms, total, totais, obras] = await Promise.all([
    prisma.rM.findMany({
      where,
      orderBy: { createdAt: "desc" },
      // ⚠⚠ SEM TETO COM OBRA ESCOLHIDA — a obra vem inteira, que é o pedido do Matheus
      // (16/09/2026): "eu preciso ter um filtro completo de tudo referente a obra".
      ...(opNumero ? {} : { take: LIMITE_SEM_OBRA }),
      include: {
        op: { select: { id: true, numero: true, cliente: true } },
        createdBy: { select: { name: true } },
        itens: {
          orderBy: { ordem: "asc" },
          select: { id: true, descricao: true, status: true, qtd: true, valorDiaria: true, qtdDias: true, valorTotal: true },
        },
      },
    }),
    prisma.rM.count({ where }),
    prisma.rM.groupBy({ by: ["status"], where: { tipoRM: tipo }, _count: { _all: true } }),
    obrasDoEscopo(escopo),
  ]);

  const statusCount = totais.reduce((acc, t) => {
    acc[t.status] = t._count._all;
    return acc;
  }, {});

  return { rms, statusCount, obras, total, truncada: rms.length < total };
}
