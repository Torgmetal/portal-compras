// GET /api/planejamento/prioridades
// TV de Prioridades do Planejamento: consolida os CRONOGRAMAS ATIVOS por obra e
// por ETAPA (Comercial → Engenharia → Suprimentos → Fabricação → Expedição), com
// a data de ENTREGA de cada etapa (maior fim), o progresso e o atraso. Ordena as
// obras por URGÊNCIA (atrasadas primeiro, depois prazo mais próximo).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SETOR_ORDER = ["COMERCIAL", "ENGENHARIA", "SUPRIMENTOS", "FABRICACAO", "EXPEDICAO", "MONTAGEM"];
const norm = (s) => String(s || "").trim().toLowerCase();
const dias = (a, b) => (a && b ? Math.max(0, Math.round((new Date(b) - new Date(a)) / 86400000)) : 0);

export async function GET() {
  try { await requireRole(["ADMIN", "PLANEJAMENTO", "PRODUCAO", "PCP", "COMERCIAL"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const cronos = await prisma.cronograma.findMany({
    where: { ativo: true },
    select: {
      id: true, opNumero: true, titulo: true,
      op: { select: { numero: true, cliente: true, obra: true } },
      tarefas: {
        where: { isSummary: false, outlineLevel: { gt: 1 } },
        select: { nome: true, departamento: true, dataInicioPrevista: true, dataFimPrevista: true, percentualRealizado: true, duracaoDias: true, motivoBloqueio: true, dataLiberacao: true },
      },
    },
  });

  const now = new Date();
  const obras = [];

  for (const c of cronos) {
    if (!c.tarefas.length) continue;
    const porSetor = {};
    for (const t of c.tarefas) {
      const s = t.departamento || "OUTROS";
      (porSetor[s] = porSetor[s] || []).push(t);
    }

    const setores = [];
    let urgenciaFim = null;   // menor fim pendente (pra ordenar)
    let atrasoMax = 0;        // maior atraso (dias) de qualquer etapa

    const ordem = [...SETOR_ORDER.filter((s) => porSetor[s]), ...Object.keys(porSetor).filter((s) => !SETOR_ORDER.includes(s))];
    for (const s of ordem) {
      const ts = porSetor[s];
      const fins = ts.map((t) => t.dataFimPrevista).filter(Boolean).map((d) => new Date(d));
      const inis = ts.map((t) => t.dataInicioPrevista).filter(Boolean).map((d) => new Date(d));
      const entrega = fins.length ? new Date(Math.max(...fins)) : null;      // entrega da etapa
      const inicio = inis.length ? new Date(Math.min(...inis)) : null;
      const pctMed = Math.round(ts.reduce((a, t) => a + (t.percentualRealizado || 0), 0) / ts.length);
      const concluida = ts.every((t) => (t.percentualRealizado || 0) >= 100);
      const bloqueada = ts.some((t) => t.motivoBloqueio && !t.dataLiberacao);
      // Atrasada: alguma tarefa venceu, não concluída e não bloqueada.
      const atrasoDias = concluida ? 0 : Math.max(0, ...ts.map((t) => {
        const blk = t.motivoBloqueio && !t.dataLiberacao;
        if (blk || (t.percentualRealizado || 0) >= 100 || !t.dataFimPrevista) return 0;
        return new Date(t.dataFimPrevista) < now ? Math.ceil((now - new Date(t.dataFimPrevista)) / 86400000) : 0;
      }));

      // Fabricação: sub-etapas (por nome) — separada se >1 nome distinto; senão unificada (com duração).
      let subEtapas = null, unificada = false, duracaoFab = 0;
      if (s === "FABRICACAO") {
        const porNome = new Map();
        for (const t of ts) {
          const k = norm(t.nome);
          if (!porNome.has(k)) porNome.set(k, { nome: t.nome, tarefas: [] });
          porNome.get(k).tarefas.push(t);
        }
        const nomes = [...porNome.values()];
        if (nomes.length > 1) {
          subEtapas = nomes.map((g) => {
            const gf = g.tarefas.map((t) => t.dataFimPrevista).filter(Boolean).map((d) => new Date(d));
            return {
              nome: g.nome,
              entrega: gf.length ? new Date(Math.max(...gf)) : null,
              pct: Math.round(g.tarefas.reduce((a, t) => a + (t.percentualRealizado || 0), 0) / g.tarefas.length),
            };
          });
        } else {
          unificada = true;
          // "tempo para executar": soma das durações se houver; senão o intervalo início→fim.
          const somaDur = ts.reduce((a, t) => a + (Number(t.duracaoDias) || 0), 0);
          duracaoFab = somaDur > 0 ? somaDur : dias(inicio, entrega);
        }
      }

      setores.push({ setor: s, entrega, inicio, pct: pctMed, concluida, bloqueada, atrasoDias, subEtapas, unificada, duracaoFab });
      if (!concluida && entrega) urgenciaFim = !urgenciaFim || entrega < urgenciaFim ? entrega : urgenciaFim;
      if (atrasoDias > atrasoMax) atrasoMax = atrasoDias;
    }

    // A TV mostra só o que falta: tira as etapas 100% concluídas — e a obra inteira
    // quando não sobra nenhuma etapa pendente (obra 100%).
    const setoresVisiveis = setores.filter((s) => !s.concluida);
    if (!setoresVisiveis.length) continue;

    const pctGeral = Math.round(c.tarefas.reduce((a, t) => a + (t.percentualRealizado || 0), 0) / c.tarefas.length);
    obras.push({
      cronogramaId: c.id,
      opNumero: c.op?.numero || c.opNumero,
      obra: c.op?.obra || c.titulo || c.opNumero,
      cliente: c.op?.cliente || null,
      pctGeral,
      atrasoMax,
      urgenciaFim: urgenciaFim ? urgenciaFim.toISOString() : null,
      setores: setoresVisiveis.map((s) => {
        // Dentro da Fabricação, também esconde as fases (sub-etapas) já 100%.
        const sub = s.subEtapas ? s.subEtapas.filter((e) => (e.pct || 0) < 100) : null;
        return {
          ...s,
          entrega: s.entrega?.toISOString() || null,
          inicio: s.inicio?.toISOString() || null,
          subEtapas: sub && sub.length ? sub.map((e) => ({ ...e, entrega: e.entrega?.toISOString() || null })) : null,
        };
      }),
    });
  }

  // Ordena: atrasadas primeiro (maior atraso), depois prazo mais próximo; concluídas por último.
  obras.sort((a, b) => {
    if ((b.atrasoMax > 0) !== (a.atrasoMax > 0)) return (b.atrasoMax > 0) - (a.atrasoMax > 0);
    if (a.atrasoMax !== b.atrasoMax) return b.atrasoMax - a.atrasoMax;
    if (!a.urgenciaFim) return 1;
    if (!b.urgenciaFim) return -1;
    return new Date(a.urgenciaFim) - new Date(b.urgenciaFim);
  });
  obras.forEach((o, i) => { o.ordem = i + 1; });

  return NextResponse.json({ obras, geradoEm: new Date().toISOString() });
}
