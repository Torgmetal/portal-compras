// Prioridades de PRODUÇÃO por bloco de setor (Painel de Produção).
// GET  — as peças MARCADAS como prioridade (PecaConjunto.prioridade != null), agrupadas em 3
//        blocos pelo SETOR REAL onde a peça está agora, por OP, na ordem da prioridade.
//          • Preparação            = Corte
//          • Montagem + Solda
//          • Acabamento, Jato e Pintura
//        (Expedição/expedido sai — já não é "onde falar com o setor".)
// POST — reordena: troca a prioridade entre DUAS peças da MESMA OP (↑/↓ na tela).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { carregarPrioridadesPorObra } from "@/lib/prioridades-setor-data";
import { setorRealIndex, FLUXO_SETORES, noTerceiroAgora } from "@/lib/prioridades-setor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES_VER = ["ADMIN", "PLANEJAMENTO", "PCP", "PRODUCAO", "COMERCIAL"];
const ROLES_EDIT = ["ADMIN", "PLANEJAMENTO", "PCP"];

const BLOCOS = [
  { key: "preparacao", label: "Preparação", setores: ["CORTE"] },
  { key: "montagem", label: "Montagem + Solda", setores: ["MONTAGEM", "SOLDA"] },
  { key: "acabamento", label: "Acabamento, Jato e Pintura", setores: ["ACABAMENTO", "JATO", "PINTURA"] },
];
const IDX = Object.fromEntries(FLUXO_SETORES.map((s, i) => [s.key, i]));
const LABEL = Object.fromEntries(FLUXO_SETORES.map((s) => [s.key, s.label]));

// índice do setor real da peça → key do bloco (não iniciada = -1 → Preparação).
function blocoDoIdx(idx) {
  const i = idx < 0 ? IDX.CORTE : idx;
  if (i <= IDX.CORTE) return "preparacao";
  if (i <= IDX.SOLDA) return "montagem";
  if (i <= IDX.PINTURA) return "acabamento";
  return null; // Expedição/expedido → fora
}

export async function GET() {
  try { await requireRole(ROLES_VER); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { porObra } = await carregarPrioridadesPorObra();
  const opInfo = new Map(porObra.map((o) => [o.opId, o])); // opId → { realMap, obra, cliente, refCliente, opNumero }
  const acc = Object.fromEntries(BLOCOS.map((b) => [b.key, new Map()])); // bloco → (opNumero → { info, pecas })

  // Peças MARCADAS (prioridade != null) das OPs ativas — lidas DIRETO do banco, independente de
  // LPC/LE. (O universo do TV usa só a LPC quando ela existe e descartaria prioridades marcadas na
  // LE — ex.: as chapas/guarda-corpos da OP-089.) O setor atual vem do realMap (Syneco+status).
  const opIds = [...opInfo.keys()];
  const pecas = opIds.length ? await prisma.pecaConjunto.findMany({
    where: { opId: { in: opIds }, prioridade: { not: null } },
    select: { id: true, opId: true, marca: true, descricao: true, pesoTotalKg: true, prioridade: true, status: true, terceirizado: true, destinoTerceirizado: true, terceirizadoRecebidoEm: true, terceiroRetornoPrevisto: true },
  }) : [];

  for (const pc of pecas) {
    const o = opInfo.get(pc.opId);
    if (!o) continue;
    const idx = setorRealIndex(pc, o.realMap);
    const bloco = blocoDoIdx(idx);
    if (!bloco) continue;
    const setorKey = idx < 0 ? "CORTE" : FLUXO_SETORES[idx]?.key || "CORTE";
    const m = acc[bloco];
    if (!m.has(o.opNumero)) m.set(o.opNumero, { opNumero: o.opNumero, obra: o.obra, cliente: o.cliente, refCliente: o.refCliente, pecas: [] });
    const terc = noTerceiroAgora(pc);
    m.get(o.opNumero).pecas.push({
      id: pc.id, marca: pc.marca, descricao: pc.descricao || null, pesoTotalKg: Math.round(Number(pc.pesoTotalKg) || 0),
      prioridade: pc.prioridade, setor: LABEL[setorKey] || setorKey,
      terceiro: terc, retornoPrevisto: terc ? (pc.terceiroRetornoPrevisto || null) : null,
    });
  }

  const blocos = BLOCOS.map((b) => {
    const ops = [...acc[b.key].values()]
      .map((op) => ({ ...op, pecas: op.pecas.sort((a, z) => a.prioridade - z.prioridade), pesoKg: op.pecas.reduce((s, x) => s + x.pesoTotalKg, 0) }))
      .sort((a, z) => String(a.opNumero).localeCompare(String(z.opNumero), "pt-BR", { numeric: true }));
    return { key: b.key, label: b.label, ops, total: ops.reduce((s, op) => s + op.pecas.length, 0) };
  });

  return NextResponse.json({ blocos, geradoEm: new Date().toISOString() });
}

// Reordena trocando a prioridade entre duas peças da MESMA OP (o "de fato 1,2,3").
export async function POST(req) {
  let user;
  try { user = await requireRole(ROLES_EDIT); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { aId, bId } = await req.json().catch(() => ({}));
  if (!aId || !bId || aId === bId) return NextResponse.json({ error: "Informe duas peças distintas." }, { status: 400 });

  const [a, b] = await Promise.all([
    prisma.pecaConjunto.findUnique({ where: { id: aId }, select: { id: true, opId: true, prioridade: true, marca: true } }),
    prisma.pecaConjunto.findUnique({ where: { id: bId }, select: { id: true, opId: true, prioridade: true, marca: true } }),
  ]);
  if (!a || !b) return NextResponse.json({ error: "Peça não encontrada." }, { status: 404 });
  if (a.opId !== b.opId) return NextResponse.json({ error: "As peças são de OPs diferentes." }, { status: 400 });
  if (a.prioridade == null || b.prioridade == null) return NextResponse.json({ error: "Ambas precisam estar marcadas como prioridade." }, { status: 400 });

  await prisma.$transaction([
    prisma.pecaConjunto.update({ where: { id: a.id }, data: { prioridade: b.prioridade } }),
    prisma.pecaConjunto.update({ where: { id: b.id }, data: { prioridade: a.prioridade } }),
  ]);
  await prisma.auditLog.create({ data: { userId: user.id, action: "REORDENAR_PRIORIDADE", entity: "PecaConjunto", entityId: `${a.marca}↔${b.marca}`, diff: { [a.marca]: b.prioridade, [b.marca]: a.prioridade } } }).catch(() => {});

  return NextResponse.json({ ok: true });
}
