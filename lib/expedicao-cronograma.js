import "server-only";
import { prisma } from "@/lib/prisma";
import { progressoEstrutura, TERMOS_NAO_ESTRUTURAL_PADRAO } from "@/lib/expedicao-estrutura";

// Alinha o cronograma com o expedido das listas de expedição (Vitor 09/08). A linha-resumo
// "Expedição" recebe o % da ESTRUTURA (kg embarcado ÷ kg total, fora grade/telha/steel deck…).
// Grade de piso, telhas e fixadores têm linhas próprias e não entram nesse %.

/** Termos de exclusão editáveis (tabela ExpedicaoItemExcluido); null se ainda não existe. */
export async function carregarTermosExcluidos() {
  try {
    const rows = await prisma.$queryRawUnsafe(`SELECT termo FROM "ExpedicaoItemExcluido" ORDER BY termo`);
    const termos = rows.map((r) => r.termo).filter(Boolean);
    return termos.length ? termos : TERMOS_NAO_ESTRUTURAL_PADRAO;
  } catch {
    return TERMOS_NAO_ESTRUTURAL_PADRAO; // tabela ainda não criada → usa o padrão
  }
}

/** Acha a tarefa-resumo "Expedição" (geral) do cronograma de uma OP. */
async function tarefaExpedicaoGeral(cronogramaId) {
  return prisma.cronogramaTarefa.findFirst({
    where: { cronogramaId, departamento: "EXPEDICAO", nome: { equals: "Expedição", mode: "insensitive" } },
    select: { id: true, percentualRealizado: true, nome: true },
  });
}

/**
 * Alinha a linha "Expedição" do cronograma da OP com o expedido das listas.
 * @returns {Promise<null|{ok:boolean,motivo?:string,de?:number,para?:number,pe?:object}>}
 */
export async function alinharCronogramaExpedicao(opId, termos) {
  if (!opId) return null;
  const term = termos || (await carregarTermosExcluidos());
  const [listas, cronograma] = await Promise.all([
    prisma.listaExpedicao.findMany({ where: { opId }, select: { marcasJson: true } }),
    prisma.cronograma.findFirst({ where: { opId }, select: { id: true } }),
  ]);
  if (!cronograma) return null;
  if (!listas.length) return { ok: false, motivo: "OP sem lista de expedição" };

  const marcas = listas.flatMap((l) => (Array.isArray(l.marcasJson) ? l.marcasJson : []));
  const pe = progressoEstrutura(marcas, term);
  if (pe.totalKg <= 0) return { ok: false, motivo: "lista sem estrutura com peso" };

  const tarefa = await tarefaExpedicaoGeral(cronograma.id);
  if (!tarefa) return { ok: false, motivo: "cronograma sem linha 'Expedição'", pe };

  // Avança só: nunca abaixo do que já foi lançado à mão (protege lista desatualizada).
  const novoPct = Math.max(tarefa.percentualRealizado || 0, pe.pct);
  await prisma.cronogramaTarefa.update({
    where: { id: tarefa.id },
    data: {
      percentualRealizado: novoPct,
      qtdePlanejada: Math.round(pe.totalKg),
      qtdeRealizada: Math.round(pe.expedidoKg),
    },
  });
  return { ok: true, de: tarefa.percentualRealizado, para: novoPct, pe };
}

/** Alinha todas as OPs que têm lista + cronograma. Retorna o resumo por OP. */
export async function alinharTodosCronogramas() {
  const term = await carregarTermosExcluidos();
  const cronos = await prisma.cronograma.findMany({ where: { opId: { not: null } }, select: { opId: true } });
  const opIds = [...new Set(cronos.map((c) => c.opId))];
  const out = [];
  for (const opId of opIds) {
    try {
      const r = await alinharCronogramaExpedicao(opId, term);
      if (r) out.push({ opId, ...r });
    } catch (e) {
      out.push({ opId, ok: false, motivo: e.message });
    }
  }
  return out;
}
