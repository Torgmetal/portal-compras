// Datas necessárias POR SETOR de cada OP (o "Início de Produção").
// GET   — OPs dos cronogramas ativos com: datas sugeridas pelo cronograma (datasSetorCrono)
//         + datas informadas manualmente (datasSetor, da SolicitacaoProducao).
// PATCH — grava/atualiza as datas por setor de uma OP. Essas datas SOBREPÕEM o cronograma
//         na TV de Prioridades. Só mexe em datasSetor (não altera prioridade/status).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { FLUXO_SETORES, datasSetorDoCronograma } from "@/lib/prioridades-setor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES = ["ADMIN", "PLANEJAMENTO", "COMERCIAL"];
const KEYS = FLUXO_SETORES.map((s) => s.key);
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

export async function GET() {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const cronos = await prisma.cronograma.findMany({
    where: { ativo: true },
    select: {
      opNumero: true, titulo: true,
      op: { select: { id: true, numero: true, obra: true, cliente: true } },
      tarefas: { where: { isSummary: false }, select: { departamento: true, nome: true, dataFimPrevista: true } },
    },
  });

  const obras = [];
  const nums = [];
  for (const c of cronos) {
    if (!c.op?.id) continue;
    const num = c.op.numero || c.opNumero;
    obras.push({ opId: c.op.id, opNumero: num, obra: c.op.obra || c.titulo || num, cliente: c.op.cliente || null, datasSetorCrono: datasSetorDoCronograma(c.tarefas) });
    nums.push(num);
  }
  const sols = nums.length
    ? await prisma.solicitacaoProducao.findMany({ where: { opNumero: { in: nums } }, select: { opNumero: true, datasSetor: true } })
    : [];
  const solMap = new Map(sols.map((s) => [s.opNumero, s.datasSetor || {}]));

  const ops = obras
    .map((o) => ({ ...o, datasSetor: solMap.get(o.opNumero) || {} }))
    .sort((a, b) => String(a.opNumero).localeCompare(String(b.opNumero), "pt-BR", { numeric: true }));

  return NextResponse.json({ setores: FLUXO_SETORES, ops });
}

export async function PATCH(req) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { opNumero, opId, datasSetor } = await req.json().catch(() => ({}));
  if (!opNumero) return NextResponse.json({ error: "opNumero obrigatório" }, { status: 400 });

  // Só setores válidos e datas no formato certo.
  const limpo = {};
  for (const k of KEYS) { const v = datasSetor?.[k]; if (v && RE_DATA.test(v)) limpo[k] = v; }

  await prisma.solicitacaoProducao.upsert({
    where: { opNumero },
    update: { datasSetor: limpo, ...(opId ? { opId } : {}) },
    create: { opNumero, opId: opId || null, datasSetor: limpo, status: "SOLICITADA", prioridade: "MEDIA" },
  });
  return NextResponse.json({ ok: true });
}
