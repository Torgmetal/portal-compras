// GET /api/pcp/dashboard-prioridades
// Dashboard TV do PCP: prioridades marcadas no Relatório de Produção (por setor),
// agrupadas por OBRA, com nº de peças, % concluído, dias úteis restantes até o
// prazo estimado e a META de peças/dia para bater a data. Números vêm ao vivo do
// Syneco (mesOrdem); a baixa manual (RelatorioObraConcluida) força 100%.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { whereSetorSyneco } from "@/lib/syneco-dia";

export const runtime = "nodejs";
export const maxDuration = 30;

const FLUXO = ["CORTE", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA"];
const SETOR_NOME = { CORTE: "Corte", MONTAGEM: "Montagem", SOLDA: "Solda", ACABAMENTO: "Acabamento", JATO: "Jato", PINTURA: "Pintura" };

// Dias ÚTEIS (seg–sex) de hoje até a data alvo, inclusive. Sem calendário de
// feriados (assunção combinada). Se o alvo já passou → 0.
function diasUteisRestantes(dataAlvo) {
  if (!dataAlvo) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(dataAlvo);
  alvo.setHours(0, 0, 0, 0);
  if (alvo < hoje) return 0;
  let dias = 0;
  const d = new Date(hoje);
  while (d <= alvo) {
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) dias++;
    d.setDate(d.getDate() + 1);
  }
  return dias;
}

export async function GET() {
  try {
    await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  try {
    const prioridades = await prisma.producaoPrioridade.findMany({ orderBy: [{ setor: "asc" }, { ordem: "asc" }] });
    if (prioridades.length === 0) {
      return NextResponse.json({ obras: [], geradoEm: new Date().toISOString() });
    }

    const setores = [...new Set(prioridades.map((p) => p.setor))];

    // Agregação Syneco (programado/produzido) por (setor, obra) + baixas manuais.
    const [porSetor, concluidasRows] = await Promise.all([
      Promise.all(
        setores.map(async (setor) => {
          const grupos = await prisma.mesOrdem.groupBy({
            by: ["obra"],
            where: whereSetorSyneco(setor),
            _sum: { planejadoUn: true, produzidoUn: true },
          });
          const map = new Map();
          for (const g of grupos) if (g.obra) map.set(g.obra, { prog: g._sum.planejadoUn || 0, prod: g._sum.produzidoUn || 0 });
          return [setor, map];
        })
      ),
      prisma.relatorioObraConcluida.findMany({ where: { setor: { in: setores } }, select: { obra: true, setor: true } }),
    ]);
    const aggMap = new Map(porSetor); // setor -> Map(obra -> {prog,prod})
    const concluidas = new Set(concluidasRows.map((c) => `${c.setor}:${c.obra}`));

    // Monta um item por prioridade
    const itens = prioridades.map((p) => {
      const agg = aggMap.get(p.setor)?.get(p.obra) || { prog: 0, prod: 0 };
      const concl = concluidas.has(`${p.setor}:${p.obra}`);
      const total = Math.round(agg.prog);
      const feitas = concl && total > 0 ? total : Math.min(Math.round(agg.prod), total || Math.round(agg.prod));
      const restantes = Math.max(0, total - feitas);
      const pct = total > 0 ? Math.round((feitas / total) * 100) : 0;
      const diasRestantes = diasUteisRestantes(p.dataEstimada);
      const pecasPorDia = restantes > 0 && diasRestantes && diasRestantes > 0 ? Math.ceil(restantes / diasRestantes) : 0;

      let situacao;
      if (total === 0) situacao = "SEM_DADOS";
      else if (restantes === 0) situacao = "CONCLUIDO";
      else if (!p.dataEstimada) situacao = "SEM_DATA";
      else if (diasRestantes <= 0) situacao = "ATRASADO";
      else if (diasRestantes <= 3) situacao = "APERTADO";
      else situacao = "NO_PRAZO";

      return {
        obra: p.obra,
        setor: p.setor,
        setorNome: SETOR_NOME[p.setor] || p.setor,
        ordem: p.ordem,
        dataEstimada: p.dataEstimada,
        pecasTotal: total,
        pecasConcluidas: feitas,
        restantes,
        pct,
        diasRestantes,
        pecasPorDia,
        situacao,
      };
    });

    // Agrupa por OBRA; obra ordenada pela melhor (menor) ordem; itens pelo fluxo.
    const obrasMap = new Map();
    for (const it of itens) {
      if (!obrasMap.has(it.obra)) obrasMap.set(it.obra, []);
      obrasMap.get(it.obra).push(it);
    }
    const obras = [...obrasMap.entries()]
      .map(([obra, lista]) => {
        lista.sort((a, b) => FLUXO.indexOf(a.setor) - FLUXO.indexOf(b.setor));
        return { obra, melhorOrdem: Math.min(...lista.map((x) => x.ordem)), itens: lista };
      })
      .sort((a, b) => a.melhorOrdem - b.melhorOrdem || String(a.obra).localeCompare(String(b.obra), undefined, { numeric: true }));

    return NextResponse.json({ obras, geradoEm: new Date().toISOString() });
  } catch (e) {
    console.error("[dashboard-prioridades] erro:", e?.message);
    return NextResponse.json({ error: e?.message || "Erro interno" }, { status: 500 });
  }
}
