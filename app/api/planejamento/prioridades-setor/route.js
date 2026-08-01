// GET /api/planejamento/prioridades-setor
// TV de Prioridades POR SETOR (Planejamento): cada setor (Preparação(Corte) → Montagem →
// Solda → Acabamento → Jato → Pintura → Expedição) vira uma "raia" com a sua própria fila
// de OPs, e o progresso é em KG REAIS — total pela lista LPC/LE e produzido pelo Syneco.
//
// Fonte das OPs: cronogramas ATIVOS (as datas de entrega saem deles). Inclusão manual de
// OPs sem cronograma virá numa próxima etapa.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { normalizeSetorSyneco } from "@/lib/syneco-dia";
import { FLUXO_SETORES, progressoPorSetor, mapaSetorReal, croquisCortadosPorConjunto } from "@/lib/prioridades-setor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES = ["ADMIN", "PLANEJAMENTO", "PRODUCAO", "PCP", "COMERCIAL"];

export async function GET() {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  // 1) Cronogramas ativos → OPs + datas de entrega (Expedição) + fallback de fim.
  const cronos = await prisma.cronograma.findMany({
    where: { ativo: true },
    select: {
      id: true, opNumero: true, titulo: true, dataFim: true,
      op: { select: { id: true, numero: true, cliente: true, obra: true, refCliente: true } },
      tarefas: {
        where: { isSummary: false, departamento: "EXPEDICAO" },
        select: { dataFimPrevista: true },
      },
    },
  });

  // OPs com id resolvido (precisamos do opId pra casar peças e Syneco).
  const obras = [];
  const opIds = [];
  for (const c of cronos) {
    if (!c.op?.id) continue;
    const fins = c.tarefas.map((t) => t.dataFimPrevista).filter(Boolean).map((d) => new Date(d));
    const entrega = fins.length ? new Date(Math.max(...fins)) : (c.dataFim ? new Date(c.dataFim) : null);
    obras.push({
      opId: c.op.id,
      opNumero: c.op.numero || c.opNumero,
      obra: c.op.obra || c.titulo || c.opNumero,
      cliente: c.op.cliente || null,
      refCliente: c.op.refCliente || null,
      entrega,
    });
    opIds.push(c.op.id);
  }
  if (!opIds.length) return NextResponse.json({ lanes: laneShell(), geradoEm: new Date().toISOString() });

  // 2) Peças das OPs (marca, tipo, peso, status, fonte, nº de croquis do conjunto).
  const pecasRaw = await prisma.pecaConjunto.findMany({
    where: { opId: { in: opIds } },
    select: {
      opId: true, marca: true, tipoPeca: true, pesoTotalKg: true, status: true, fonte: true,
      qte: true, qteProduzida: true, corteConcluidoEm: true,
      _count: { select: { conjuntoCroquis: true } },
    },
  });
  const pecasPorOp = new Map();
  for (const p of pecasRaw) {
    const arr = pecasPorOp.get(p.opId) || [];
    arr.push({
      marca: p.marca, tipoPeca: p.tipoPeca, pesoTotalKg: p.pesoTotalKg, status: p.status, fonte: p.fonte,
      qte: p.qte, qteProduzida: p.qteProduzida, corteConcluidoEm: p.corteConcluidoEm,
      croquiCount: p._count.conjuntoCroquis,
    });
    pecasPorOp.set(p.opId, arr);
  }

  // 3) Setor real por peça (Syneco): produzidoUn>0 por (opId, item, setor).
  const syn = await prisma.mesOrdem.groupBy({
    by: ["opId", "item", "setor"],
    where: { opId: { in: opIds }, produzidoUn: { gt: 0 } },
    _sum: { produzidoUn: true },
  });
  const synPorOp = new Map();
  for (const l of syn) {
    const arr = synPorOp.get(l.opId) || [];
    arr.push({ item: l.item, setor: l.setor });
    synPorOp.set(l.opId, arr);
  }

  // 3b) Vínculo conjunto→croqui (pra saber que um croqui foi cortado quando o conjunto avançou).
  const links = await prisma.conjuntoCroqui.findMany({
    where: { conjunto: { opId: { in: opIds } } },
    select: { conjunto: { select: { opId: true, marca: true } }, croqui: { select: { marca: true } } },
  });
  const linksPorOp = new Map();
  for (const l of links) {
    const arr = linksPorOp.get(l.conjunto.opId) || [];
    arr.push({ conj: l.conjunto.marca, croqui: l.croqui.marca });
    linksPorOp.set(l.conjunto.opId, arr);
  }

  const now = new Date();

  // 4) Progresso por setor de cada OP.
  const porObra = obras.map((o) => {
    const pecas = pecasPorOp.get(o.opId) || [];
    const realMap = mapaSetorReal(synPorOp.get(o.opId) || [], normalizeSetorSyneco);
    // Croquis cortados porque o conjunto-pai já avançou (status OU Syneco).
    const cortados = croquisCortadosPorConjunto(pecas, realMap, linksPorOp.get(o.opId) || []);
    const universo = selecionarUniverso(pecas)
      .map((p) => (p.tipoPeca === "CROQUI" && cortados.has(p.marca) ? { ...p, corteForcado: true } : p));
    const setores = progressoPorSetor(universo, realMap);
    const exped = setores.find((s) => s.setor === "EXPEDICAO");
    const expedidoOk = exped && exped.pct != null && exped.pct >= 100;
    const atrasoDias = o.entrega && !expedidoOk && new Date(o.entrega) < now
      ? Math.ceil((now - new Date(o.entrega)) / 86400000) : 0;
    return { ...o, setores, atrasoDias };
  });

  // 5) Monta as raias por setor: só OPs que passam no setor (totalKg>0) e ainda têm pendência (pct<100).
  const lanes = FLUXO_SETORES.map((s) => {
    const ops = [];
    for (const o of porObra) {
      const st = o.setores.find((x) => x.setor === s.key);
      if (!st || st.totalKg <= 0 || (st.pct != null && st.pct >= 100)) continue;
      ops.push({
        opNumero: o.opNumero, obra: o.obra, cliente: o.cliente, refCliente: o.refCliente,
        entrega: o.entrega ? o.entrega.toISOString() : null, atrasoDias: o.atrasoDias,
        totalKg: st.totalKg, feitoKg: st.feitoKg, pendenteKg: st.pendenteKg, pct: st.pct ?? 0,
      });
    }
    // Ordem de urgência: atrasadas primeiro (maior atraso), depois entrega mais próxima, depois mais kg pendente.
    ops.sort((a, b) => {
      if ((b.atrasoDias > 0) !== (a.atrasoDias > 0)) return (b.atrasoDias > 0) - (a.atrasoDias > 0);
      if (a.atrasoDias !== b.atrasoDias) return b.atrasoDias - a.atrasoDias;
      if (a.entrega && b.entrega && a.entrega !== b.entrega) return new Date(a.entrega) - new Date(b.entrega);
      if (a.entrega !== b.entrega) return a.entrega ? -1 : 1;
      return b.pendenteKg - a.pendenteKg;
    });
    ops.forEach((op, i) => { op.ordem = i + 1; });
    return { setor: s.key, label: s.label, filaKg: ops.reduce((acc, op) => acc + op.pendenteKg, 0), ops };
  });

  return NextResponse.json({ lanes, geradoEm: new Date().toISOString() });
}

function laneShell() {
  return FLUXO_SETORES.map((s) => ({ setor: s.key, label: s.label, filaKg: 0, ops: [] }));
}

// Escolhe a fonte de peças da OP: se tem LPC (com estrutura conjunto/croqui/avulsa) usa a LPC
// INTEIRA — a lib roteia cada tipo (croqui→Corte, conjunto→Montagem.., avulsa→Corte+Acab..).
// Só com LE (sem estrutura) usa a LE tratando cada peça como solo (sem como saber quem monta/solda).
function selecionarUniverso(pecas) {
  const lpc = pecas.filter((p) => p.fonte === "LPC_IMPORT");
  if (lpc.length) return lpc;
  return pecas
    .filter((p) => p.fonte === "LE_IMPORT")
    .map((p) => ({ ...p, tipoPeca: null, croquiCount: 0 }));
}
