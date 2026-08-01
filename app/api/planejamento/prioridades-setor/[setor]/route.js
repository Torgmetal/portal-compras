// GET /api/planejamento/prioridades-setor/[setor]
// Tela dedicada a UM setor (TV do chão de fábrica): a fila de OPs daquele setor com
// DETALHE das peças pendentes — prioritárias (já marcadas) primeiro e a sequência.
// Devolve também um `resumo` de todos os setores (fila/nº de OPs) pras abas de navegação.
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { FLUXO_SETORES, progressoPorSetor, pecasPendentesNoSetor, entregaDoSetor } from "@/lib/prioridades-setor";
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

  // Progresso de todos os setores por obra (uma vez), pra montar a fila do setor e o resumo.
  const comSetores = porObra.map((o) => ({ o, setores: progressoPorSetor(o.universo, o.realMap) }));

  // Fila detalhada do setor pedido.
  const ops = [];
  for (const { o, setores } of comSetores) {
    const st = setores.find((x) => x.setor === setorKey);
    if (!st || st.totalKg <= 0 || (st.pct != null && st.pct >= 100)) continue;
    const pend = pecasPendentesNoSetor(o.universo, o.realMap, setorKey);
    const prioritarias = pend.filter((p) => p.prioridade != null);
    const sequencia = pend.filter((p) => p.prioridade == null);
    const es = entregaDoSetor(o.datasSetor, setorKey, o.entrega, now);
    ops.push({
      opNumero: o.opNumero, obra: o.obra, cliente: o.cliente, refCliente: o.refCliente,
      entrega: es.entrega, atrasoDias: es.atrasoDias, doSetor: es.doSetor,
      totalKg: st.totalKg, feitoKg: st.feitoKg, pendenteKg: st.pendenteKg, pct: st.pct ?? 0,
      qtdPecas: pend.length, qtdPrioritarias: prioritarias.length,
      prioritarias: prioritarias.slice(0, 16),
      sequencia: sequencia.slice(0, 16),
    });
  }
  ops.sort(ordenarUrgencia);
  ops.forEach((op, i) => { op.ordem = i + 1; });

  // Resumo de todos os setores (pras abas): fila em kg e nº de OPs pendentes.
  const resumo = FLUXO_SETORES.map((s) => {
    let filaKg = 0, nOps = 0;
    for (const { setores } of comSetores) {
      const st = setores.find((x) => x.setor === s.key);
      if (st && st.totalKg > 0 && (st.pct == null || st.pct < 100)) { filaKg += st.pendenteKg; nOps++; }
    }
    return { setor: s.key, label: s.label, filaKg, nOps };
  });

  return NextResponse.json({
    setor: setorKey, label: meta.label,
    filaKg: ops.reduce((a, op) => a + op.pendenteKg, 0),
    ops, resumo, aguardando: obrasAguardandoLista(porObra),
    geradoEm: new Date().toISOString(),
  });
}
