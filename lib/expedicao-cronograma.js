import "server-only";
import { prisma } from "@/lib/prisma";
import { progressoEstrutura, completudeMarcas, gruposDaTarefa, grupoMarca, TERMOS_NAO_ESTRUTURAL_PADRAO } from "@/lib/expedicao-estrutura";

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

const ehLinhaGeral = (nome) => /^expedi[çc][aã]o$/i.test(String(nome || "").trim());

/**
 * Alinha TODAS as tarefas de expedição do cronograma da OP com o expedido das listas.
 * - Linha "Expedição" (geral) → % da ESTRUTURA em kg (fora grade/telha/parafuso/steel deck).
 * - Demais linhas (Guarda corpo, Telhas, Grade, Fixadores…) → % das marcas do seu grupo,
 *   por kg se tiverem peso, senão por unidade. Avança só (nunca abaixo do manual).
 * @returns {Promise<null|{ok:boolean,motivo?:string,tarefas?:Array}>}
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
  const tarefas = await prisma.cronogramaTarefa.findMany({
    where: { cronogramaId: cronograma.id, departamento: "EXPEDICAO", isSummary: false },
    select: { id: true, nome: true, percentualRealizado: true },
  });
  if (!tarefas.length) return { ok: false, motivo: "cronograma sem tarefas de expedição" };

  const feitas = [];
  for (const t of tarefas) {
    let pct = null, kg = null;
    if (ehLinhaGeral(t.nome)) {
      const pe = progressoEstrutura(marcas, term);
      if (pe.totalKg <= 0) continue;
      pct = pe.pct; kg = { plan: Math.round(pe.totalKg), real: Math.round(pe.expedidoKg) };
    } else {
      const grupos = gruposDaTarefa(t.nome);
      if (!grupos.size) continue; // nome não mapeia p/ nenhum grupo → não mexe
      const ms = marcas.filter((m) => grupos.has(grupoMarca(m.descricao)));
      pct = completudeMarcas(ms);
      if (pct == null) continue;
    }
    const novo = Math.max(t.percentualRealizado || 0, pct); // avança só
    if (novo === t.percentualRealizado && !kg) continue;
    await prisma.cronogramaTarefa.update({
      where: { id: t.id },
      data: { percentualRealizado: novo, ...(kg ? { qtdePlanejada: kg.plan, qtdeRealizada: kg.real } : {}) },
    });
    feitas.push({ nome: t.nome, de: t.percentualRealizado, para: novo });
  }
  return { ok: true, tarefas: feitas };
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
