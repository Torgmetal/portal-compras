// GET /api/planejamento/prioridades-setor
// Visão geral (lanes) da TV de Prioridades por setor: uma raia por setor com a fila de
// OPs em kg. O carregamento pesado fica em lib/prioridades-setor-data.js (compartilhado
// com a tela de um setor só).
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { FLUXO_SETORES, progressoPorSetor, entregaDoSetor, progressoMontagemMontavel, temDetalheCorte } from "@/lib/prioridades-setor";
import { carregarPrioridadesPorObra } from "@/lib/prioridades-setor-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES = ["ADMIN", "PLANEJAMENTO", "PRODUCAO", "PCP", "COMERCIAL"];

// Ordem de urgência: atrasadas primeiro (maior atraso), depois entrega mais próxima, depois mais kg pendente.
export function ordenarUrgencia(a, b) {
  if ((b.atrasoDias > 0) !== (a.atrasoDias > 0)) return (b.atrasoDias > 0) - (a.atrasoDias > 0);
  if (a.atrasoDias !== b.atrasoDias) return b.atrasoDias - a.atrasoDias;
  if (a.entrega && b.entrega && a.entrega !== b.entrega) return new Date(a.entrega) - new Date(b.entrega);
  if (a.entrega !== b.entrega) return a.entrega ? -1 : 1;
  return b.pendenteKg - a.pendenteKg;
}

export async function GET() {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { porObra, now } = await carregarPrioridadesPorObra();

  // Progresso por setor de cada obra. MONTAGEM conta só os conjuntos montáveis (croquis já
  // cortados); guardamos temDetalhe pra tratar o Corte sem lista (alerta).
  const obras = porObra.map((o) => {
    const setores = progressoPorSetor(o.universo, o.realMap);
    const mi = setores.findIndex((x) => x.setor === "MONTAGEM");
    if (mi >= 0) setores[mi] = progressoMontagemMontavel(o.universo, o.realMap, o.links);
    return { ...o, setores, temDetalhe: temDetalheCorte(o.universo) };
  });

  const lanes = FLUXO_SETORES.map((s) => {
    const ops = [];
    for (const o of obras) {
      const es = entregaDoSetor(o.datasSetor, s.key, o.entrega, now);
      // Corte sem detalhamento (sem croqui) → ALERTA na raia, sem barra (nada pra cortar/rastrear).
      if (s.key === "CORTE" && !o.temDetalhe) {
        ops.push({
          opNumero: o.opNumero, obra: o.obra, cliente: o.cliente, refCliente: o.refCliente,
          entrega: es.entrega, atrasoDias: es.atrasoDias, doSetor: es.doSetor,
          estado: "SEM_LISTA", totalKg: 0, feitoKg: 0, pendenteKg: 0, pct: null,
        });
        continue;
      }
      const st = o.setores.find((x) => x.setor === s.key);
      if (!st || st.totalKg <= 0 || (st.pct != null && st.pct >= 100)) continue;
      // Corte com lista mas sem data de corte no cronograma → amarelo (falta programar).
      const estado = s.key === "CORTE" ? (es.doSetor ? "FILA" : "SEM_PROGRAMACAO") : "FILA";
      ops.push({
        opNumero: o.opNumero, obra: o.obra, cliente: o.cliente, refCliente: o.refCliente,
        entrega: es.entrega, atrasoDias: es.atrasoDias, doSetor: es.doSetor, estado,
        totalKg: st.totalKg, feitoKg: st.feitoKg, pendenteKg: st.pendenteKg, pct: st.pct ?? 0,
      });
    }
    // Fila real por urgência; alertas (sem lista) por último.
    ops.sort((a, b) => {
      const aa = a.estado === "SEM_LISTA", bb = b.estado === "SEM_LISTA";
      if (aa !== bb) return aa - bb;
      return ordenarUrgencia(a, b);
    });
    let pos = 0;
    ops.forEach((op) => { op.ordem = op.estado === "SEM_LISTA" ? null : ++pos; });
    return { setor: s.key, label: s.label, filaKg: ops.reduce((acc, op) => acc + (op.pendenteKg || 0), 0), ops };
  });

  // Compat: lista de obras sem lista (agora também sinalizadas como alerta na raia do Corte).
  const aguardando = obrasAguardandoLista(porObra);

  return NextResponse.json({ lanes, aguardando, geradoEm: new Date().toISOString() });
}

export function obrasAguardandoLista(porObra) {
  return porObra
    .filter((o) => o.universo.length === 0)
    .map((o) => ({ opNumero: o.opNumero, obra: o.obra, cliente: o.cliente, entrega: o.entrega ? o.entrega.toISOString() : null }))
    .sort((a, b) => (a.entrega && b.entrega ? new Date(a.entrega) - new Date(b.entrega) : a.entrega ? -1 : 1));
}
