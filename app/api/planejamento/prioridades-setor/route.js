// GET /api/planejamento/prioridades-setor
// Visão geral (lanes) da TV de Prioridades por setor: uma raia por setor com a fila de
// OPs em kg. O carregamento pesado fica em lib/prioridades-setor-data.js (compartilhado
// com a tela de um setor só).
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { FLUXO_SETORES, progressoPorSetor } from "@/lib/prioridades-setor";
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

  const obras = porObra.map((o) => {
    const setores = progressoPorSetor(o.universo, o.realMap);
    const exped = setores.find((s) => s.setor === "EXPEDICAO");
    const expedidoOk = exped && exped.pct != null && exped.pct >= 100;
    const atrasoDias = o.entrega && !expedidoOk && new Date(o.entrega) < now ? Math.ceil((now - new Date(o.entrega)) / 86400000) : 0;
    return { ...o, setores, atrasoDias };
  });

  const lanes = FLUXO_SETORES.map((s) => {
    const ops = [];
    for (const o of obras) {
      const st = o.setores.find((x) => x.setor === s.key);
      if (!st || st.totalKg <= 0 || (st.pct != null && st.pct >= 100)) continue;
      ops.push({
        opNumero: o.opNumero, obra: o.obra, cliente: o.cliente, refCliente: o.refCliente,
        entrega: o.entrega ? o.entrega.toISOString() : null, atrasoDias: o.atrasoDias,
        totalKg: st.totalKg, feitoKg: st.feitoKg, pendenteKg: st.pendenteKg, pct: st.pct ?? 0,
      });
    }
    ops.sort(ordenarUrgencia);
    ops.forEach((op, i) => { op.ordem = i + 1; });
    return { setor: s.key, label: s.label, filaKg: ops.reduce((acc, op) => acc + op.pendenteKg, 0), ops };
  });

  return NextResponse.json({ lanes, geradoEm: new Date().toISOString() });
}
