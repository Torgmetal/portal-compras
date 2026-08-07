// GET /api/planejamento/prioridades-setor/[setor]
// Tela dedicada a UM setor (TV do chão de fábrica): a fila de OPs daquele setor com
// DETALHE das peças pendentes — prioritárias (já marcadas) primeiro e a sequência.
// Devolve também um `resumo` de todos os setores (fila/nº de OPs) pras abas de navegação.
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { FLUXO_SETORES, progressoPorSetor, pecasPendentesNoSetor, entregaDoSetor, progressoMontagemMontavel, temDetalheCorte } from "@/lib/prioridades-setor";
import { carregarPrioridadesPorObra } from "@/lib/prioridades-setor-data";
import { ordenarUrgencia, obrasAguardandoLista } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES = ["ADMIN", "PLANEJAMENTO", "PRODUCAO", "PCP", "COMERCIAL"];

export async function GET(req, { params }) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { setor } = await params;
  const alvo = String(setor || "").toUpperCase();
  const semAcento = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  // aceita a key (CORTE) ou o slug do rótulo sem acento (PREPARACAO, EXPEDICAO...)
  const meta = FLUXO_SETORES.find((s) => s.key === alvo || semAcento(s.label) === alvo);
  if (!meta) return NextResponse.json({ error: "Setor inválido" }, { status: 404 });
  const setorKey = meta.key;

  const { porObra, now } = await carregarPrioridadesPorObra();

  // Progresso de todos os setores por obra (uma vez). MONTAGEM só conta os conjuntos montáveis
  // (croquis já cortados); guardamos o Set `montaveis` pra fila detalhada e temDetalhe pro Corte.
  const comSetores = porObra.map((o) => {
    const setores = progressoPorSetor(o.universo, o.realMap);
    const mi = setores.findIndex((x) => x.setor === "MONTAGEM");
    const mont = mi >= 0 ? (setores[mi] = progressoMontagemMontavel(o.universo, o.realMap, o.links)) : null;
    return { o, setores, montaveis: mont ? mont.montaveis : null, temDetalhe: temDetalheCorte(o.universo) };
  });

  // Fila detalhada do setor pedido.
  const ops = [];
  for (const { o, setores, montaveis, temDetalhe } of comSetores) {
    const es = entregaDoSetor(o.datasSetor, setorKey, o.entrega, now);
    // Corte sem detalhamento (sem croqui) → ALERTA (sem fila de peças).
    if (setorKey === "CORTE" && !temDetalhe) {
      ops.push({
        opNumero: o.opNumero, obra: o.obra, cliente: o.cliente, refCliente: o.refCliente,
        entrega: es.entrega, atrasoDias: es.atrasoDias, doSetor: es.doSetor, estado: "SEM_LISTA",
        totalKg: 0, feitoKg: 0, pendenteKg: 0, pct: null,
        qtdPecas: 0, qtdPrioritarias: 0, prioritarias: [], sequencia: [],
      });
      continue;
    }
    const st = setores.find((x) => x.setor === setorKey);
    if (!st || st.totalKg <= 0 || (st.pct != null && st.pct >= 100)) continue;
    const pend = pecasPendentesNoSetor(o.universo, o.realMap, setorKey, montaveis);
    const prioritarias = pend.filter((p) => p.prioridade != null);
    const sequencia = pend.filter((p) => p.prioridade == null);
    const estado = setorKey === "CORTE" ? (es.doSetor ? "FILA" : "SEM_PROGRAMACAO") : "FILA";
    ops.push({
      opNumero: o.opNumero, obra: o.obra, cliente: o.cliente, refCliente: o.refCliente,
      entrega: es.entrega, atrasoDias: es.atrasoDias, doSetor: es.doSetor, estado,
      totalKg: st.totalKg, feitoKg: st.feitoKg, pendenteKg: st.pendenteKg, pct: st.pct ?? 0,
      qtdPecas: pend.length, qtdPrioritarias: prioritarias.length,
      prioritarias: prioritarias.slice(0, 16),
      sequencia: sequencia.slice(0, 16),
    });
  }
  ops.sort((a, b) => {
    const aa = a.estado === "SEM_LISTA", bb = b.estado === "SEM_LISTA";
    if (aa !== bb) return aa - bb;
    return ordenarUrgencia(a, b);
  });
  let pos = 0;
  ops.forEach((op) => { op.ordem = op.estado === "SEM_LISTA" ? null : ++pos; });

  // Resumo de todos os setores (pras abas): fila em kg + nº de OPs pendentes; no Corte,
  // nº de OPs sem lista (alerta) à parte.
  const resumo = FLUXO_SETORES.map((s) => {
    let filaKg = 0, nOps = 0, nAlertas = 0;
    for (const { setores, temDetalhe } of comSetores) {
      if (s.key === "CORTE" && !temDetalhe) { nAlertas++; continue; }
      const st = setores.find((x) => x.setor === s.key);
      if (st && st.totalKg > 0 && (st.pct == null || st.pct < 100)) { filaKg += st.pendenteKg; nOps++; }
    }
    return { setor: s.key, label: s.label, filaKg, nOps, nAlertas: s.key === "CORTE" ? nAlertas : 0 };
  });

  return NextResponse.json({
    setor: setorKey, label: meta.label,
    filaKg: ops.reduce((a, op) => a + op.pendenteKg, 0),
    ops, resumo, aguardando: obrasAguardandoLista(porObra),
    geradoEm: new Date().toISOString(),
  });
}
