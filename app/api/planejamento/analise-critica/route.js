// POST /api/planejamento/analise-critica { opNumero }
// Monta a situação real da obra (faltam por setor × Syneco, furo de apontamento,
// capacidade, gap de prazo) e pede um PLANO DE AÇÃO ao Claude. Regra: se houver
// furo, a 1ª recomendação é conferir o apontamento — os faltantes podem estar errados.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import Anthropic from "@anthropic-ai/sdk";
import { listarFurosApontamento } from "@/lib/conjuntos-setor";
import { capacidadePorSetor, diasUteis, digitosObra } from "@/lib/prazo-producao";

export const runtime = "nodejs";
export const maxDuration = 120;

const SYN = { CORTE: "Corte", MONTAGEM: "Montagem", SOLDA: "Solda", ACABAMENTO: "Acabamento", JATO: "Jato", PINTURA: "Pintura" };
const SETORES = ["CORTE", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDICAO"];

const SYSTEM_PROMPT = `Você é um analista de PCP/Planejamento da Torg Metal, metalúrgica de estruturas metálicas (fluxo: Corte → Montagem → Solda → Acabamento → Jato → Pintura → Expedição).
Recebe a SITUAÇÃO REAL de uma obra (quanto falta por setor, capacidade das máquinas, prazo) e gera um PLANO DE AÇÃO objetivo para recuperar o prazo.

REGRA CRÍTICA: se o campo "furoApontamento" indicar inconsistência (um setor com mais peças apontadas que um anterior — fisicamente impossível), a PRIMEIRA AÇÃO do plano é OBRIGATORIAMENTE conferir/corrigir os lançamentos no Syneco antes de qualquer decisão, porque as quantidades que faltam podem estar erradas. Não recomende contratar/terceirizar/hora-extra com base em números furados.

Alternativas que você deve avaliar (quando fizerem sentido): aumento de jornada (hora extra / 2º turno), terceirização de uma etapa específica (qual e por quê), repriorização na fila (passar à frente de outras obras), redistribuição entre máquinas/setores. Para cada alternativa estime o impacto (dias recuperados, aproximado) e o trade-off (custo/risco). Use os números fornecidos (capacidade kg/dia, kg faltantes) para estimar.

Responda em PORTUGUÊS, em markdown enxuto, com as seções:
## Diagnóstico (2-4 linhas)
## Antes de tudo (só se houver furo de apontamento)
## Alternativas (lista; cada uma com impacto estimado e trade-off)
## Recomendação (a melhor combinação, objetiva)
Seja prático e direto — é para o diretor decidir rápido. Não invente dados além dos fornecidos.`;

export async function POST(req) {
  try {
    await requireRole(["ADMIN", "PLANEJAMENTO", "COMERCIAL"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }
  const opNumero = String(body?.opNumero || "").trim();
  if (!opNumero) return NextResponse.json({ error: "Informe a obra (opNumero)." }, { status: 400 });

  const key = (process.env.ANTHROPIC_API_KEY || "").trim();
  if (!key) return NextResponse.json({ error: "IA indisponível (sem chave configurada)." }, { status: 503 });

  // ── Situação real ────────────────────────────────────────────
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const [sol, conjuntos, capKgDia, furosTodos] = await Promise.all([
    prisma.solicitacaoProducao.findUnique({ where: { opNumero } }),
    prisma.pecaConjunto.findMany({
      where: { fonte: "LPC_IMPORT", tipoPeca: "CONJUNTO", opNumero },
      select: { marca: true, qte: true, status: true, pesoTotalKg: true },
    }),
    capacidadePorSetor(),
    listarFurosApontamento(),
  ]);
  if (!conjuntos.length) return NextResponse.json({ error: `Obra ${opNumero} sem conjuntos da LPC.` }, { status: 404 });

  const total = conjuntos.reduce((a, c) => a + (c.qte || 0), 0);
  const totalKg = conjuntos.reduce((a, c) => a + (c.pesoTotalKg || 0), 0);
  const pastCorte = conjuntos.filter((c) => !["PENDENTE", "CORTE"].includes(c.status)).length;
  const expCount = conjuntos.filter((c) => c.status === "EXPEDIDO").length;
  const marcas = conjuntos.map((c) => c.marca);

  const mes = await prisma.mesOrdem.findMany({
    where: { setor: { in: Object.values(SYN) }, item: { in: marcas } },
    select: { setor: true, produzidoUn: true },
  });
  const s2e = Object.fromEntries(Object.entries(SYN).map(([k, v]) => [v, k]));
  const prod = {};
  for (const r of mes) { const e = s2e[r.setor]; if (e) prod[e] = (prod[e] || 0) + (r.produzidoUn || 0); }

  const ds = sol?.datasSetor || {};
  const setores = SETORES.map((setor) => {
    const data = ds[setor] || null;
    let apont = 0, concl = false, faltam = null, faltamKg = null;
    if (setor === "EXPEDICAO") { concl = conjuntos.length > 0 && expCount === conjuntos.length; apont = expCount; }
    else if (setor === "CORTE") { concl = conjuntos.length > 0 && pastCorte === conjuntos.length; apont = pastCorte; }
    else {
      apont = prod[setor] || 0;
      concl = total > 0 && apont >= total;
      faltam = Math.max(0, total - apont);
      faltamKg = total > 0 ? Math.round((faltam / total) * totalKg) : 0;
    }
    const atrasado = !!data && data < hoje && !concl;
    const capKg = setor === "EXPEDICAO" ? null : Math.round(capKgDia[setor] || 0);
    const diasParaTerminar = faltamKg != null && capKg > 0 ? Math.ceil(faltamKg / capKg) : null;
    return { setor, dataNecessaria: data, apontado: apont, total: setor === "EXPEDICAO" || setor === "CORTE" ? null : total, faltam, faltamKg, capacidadeKgDia: capKg, diasParaTerminar, atrasado, concluido: concl };
  });

  // Furo de apontamento da obra (cadeia inconsistente)
  const dig = digitosObra(opNumero);
  const furos = furosTodos.filter((f) => f.opNumero === opNumero || digitosObra(f.opNumero) === dig);

  const diasUteisAteEntrega = sol?.dataEntrega ? diasUteis(new Date(hoje + "T12:00:00Z"), sol.dataEntrega) : null;

  const situacao = {
    obra: opNumero,
    entrega: sol?.dataEntrega ? sol.dataEntrega.toISOString().slice(0, 10) : null,
    hoje,
    diasUteisAteEntrega,
    pesoTotalKg: Math.round(totalKg),
    totalUnidades: total,
    setores,
    furoApontamento: { tem: furos.length > 0, detalhes: furos.map((f) => `${f.marca}: ${f.resumo}`) },
  };

  // ── Plano de ação (Claude) ───────────────────────────────────
  let plano;
  try {
    const anthropic = new Anthropic({ apiKey: key });
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Gere o plano de ação para esta obra:\n\n${JSON.stringify(situacao, null, 2)}` }],
    });
    plano = (msg.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  } catch (e) {
    return NextResponse.json({ error: `Falha na análise da IA: ${e.message}`, situacao }, { status: 502 });
  }

  return NextResponse.json({ situacao, plano, geradoEm: new Date().toISOString() });
}
