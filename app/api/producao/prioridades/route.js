// Prioridades de PRODUÇÃO por bloco de setor (Painel de Produção).
// GET  — SÓ as OPs enviadas pra produção (OP.emProducao). Por bloco (Preparação / Montagem+Solda /
//        Acabamento,Jato,Pintura) e por OP: PRIORITÁRIAS em cima (na ordem) + as DEMAIS pendentes
//        embaixo, com o PRAZO do setor ("até quando"). O setor atual vem do realMap (Syneco+status).
//          • Preparação            = Corte
//          • Montagem + Solda
//          • Acabamento, Jato e Pintura
// POST — reordena: troca a prioridade entre DUAS peças da MESMA OP (↑/↓ na tela).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { carregarPrioridadesPorObra } from "@/lib/prioridades-setor-data";
import { setorRealIndex, FLUXO_SETORES, noTerceiroAgora, entregaDoSetor } from "@/lib/prioridades-setor";
import { ehItemComprado } from "@/lib/item-comprado";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES_VER = ["ADMIN", "PLANEJAMENTO", "PCP", "PRODUCAO", "COMERCIAL"];
const ROLES_EDIT = ["ADMIN", "PLANEJAMENTO", "PCP"];
const LIMITE_DEMAIS = 40; // teto de "demais" por OP/bloco na tela

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

// Prazo do bloco p/ uma OP = a data mais PRÓXIMA entre os setores do bloco (das datas por setor).
function prazoDoBloco(datasSetor, setores, entregaFallback, now) {
  let best = null;
  for (const s of setores) {
    const e = entregaDoSetor(datasSetor || {}, s, entregaFallback, now);
    if (e.entrega && (!best || new Date(e.entrega) < new Date(best.entrega))) best = e;
  }
  if (!best) best = entregaDoSetor(datasSetor || {}, setores[0], entregaFallback, now);
  return best.entrega ? { entrega: best.entrega, atrasoDias: best.atrasoDias, doSetor: best.doSetor } : null;
}

export async function GET() {
  try { await requireRole(ROLES_VER); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { porObra, now } = await carregarPrioridadesPorObra();
  // SÓ as OPs enviadas pra produção (as não selecionadas somem da tela).
  const emProd = porObra.filter((o) => o.emProducao);
  const opInfo = new Map(emProd.map((o) => [o.opId, o]));
  const acc = Object.fromEntries(BLOCOS.map((b) => [b.key, new Map()])); // bloco → (opNumero → { info, pecas })

  // Todas as peças (conjuntos + avulsas, sem croqui) das OPs em produção — direto do banco (LPC ou
  // LE). O setor atual de cada uma sai do realMap (Syneco + status). Priorizadas + demais.
  const opIds = [...opInfo.keys()];
  const pecas = opIds.length ? await prisma.pecaConjunto.findMany({
    // "não croqui" INCLUINDO tipoPeca NULL (avulsas/solo) — `{ not: "CROQUI" }` sozinho descarta os NULL.
    where: { opId: { in: opIds }, OR: [{ tipoPeca: { not: "CROQUI" } }, { tipoPeca: null }] },
    select: { id: true, opId: true, marca: true, descricao: true, tipoPeca: true, perfil: true, pesoTotalKg: true, prioridade: true, status: true, terceirizado: true, destinoTerceirizado: true, terceirizadoRecebidoEm: true, terceiroRetornoPrevisto: true, _count: { select: { conjuntoCroquis: true } } },
  }) : [];

  for (const pc of pecas) {
    const o = opInfo.get(pc.opId);
    if (!o) continue;
    // Itens comprados (sem peso; ou cobertura/piso: telha/rufo/calha/grade de piso) NÃO são
    // produção — não aparecem em nenhum setor. (Regra do peso, lib/item-comprado.)
    if (ehItemComprado(pc)) continue;
    // FLUXO: conjunto COMPOSTO (tem croquis/subpeças) começa na MONTAGEM — o corte dele é dos
    // croquis, então NÃO cai na Preparação. Só peça SEM subpeças (solo/avulsa) fica na Preparação.
    const composta = pc.tipoPeca === "CONJUNTO" && (pc._count?.conjuntoCroquis || 0) > 0;
    let idx = setorRealIndex(pc, o.realMap);
    if (composta && idx < IDX.MONTAGEM) idx = IDX.MONTAGEM;
    const bloco = blocoDoIdx(idx);
    if (!bloco) continue; // já expedida
    const setorKey = idx < 0 ? "CORTE" : FLUXO_SETORES[idx]?.key || "CORTE";
    const m = acc[bloco];
    if (!m.has(o.opNumero)) m.set(o.opNumero, { opNumero: o.opNumero, obra: o.obra, cliente: o.cliente, datasSetor: o.datasSetor, entrega: o.entrega, pecas: [] });
    const terc = noTerceiroAgora(pc);
    m.get(o.opNumero).pecas.push({
      id: pc.id, marca: pc.marca, descricao: pc.descricao || null, pesoTotalKg: Math.round(Number(pc.pesoTotalKg) || 0),
      prioridade: pc.prioridade, setor: LABEL[setorKey] || setorKey,
      terceiro: terc, retornoPrevisto: terc ? (pc.terceiroRetornoPrevisto || null) : null,
    });
  }

  const blocos = BLOCOS.map((b) => {
    const ops = [...acc[b.key].values()].map((op) => {
      const prioritarias = op.pecas.filter((p) => p.prioridade != null).sort((a, z) => a.prioridade - z.prioridade);
      const demaisAll = op.pecas.filter((p) => p.prioridade == null).sort((a, z) => String(a.marca).localeCompare(String(z.marca), "pt-BR", { numeric: true }));
      return {
        opNumero: op.opNumero, obra: op.obra, cliente: op.cliente,
        prazo: prazoDoBloco(op.datasSetor, b.setores, op.entrega, now),
        prioritarias, demais: demaisAll.slice(0, LIMITE_DEMAIS), demaisTotal: demaisAll.length,
        pesoKg: op.pecas.reduce((s, x) => s + x.pesoTotalKg, 0),
      };
    }).sort((a, z) => {
      // urgência: atrasadas primeiro, depois prazo mais próximo, depois nº da OP
      const aa = a.prazo?.atrasoDias > 0, za = z.prazo?.atrasoDias > 0;
      if (aa !== za) return aa ? -1 : 1;
      if (a.prazo?.entrega && z.prazo?.entrega && a.prazo.entrega !== z.prazo.entrega) return new Date(a.prazo.entrega) - new Date(z.prazo.entrega);
      if (!!a.prazo?.entrega !== !!z.prazo?.entrega) return a.prazo?.entrega ? -1 : 1;
      return String(a.opNumero).localeCompare(String(z.opNumero), "pt-BR", { numeric: true });
    });
    return { key: b.key, label: b.label, ops, total: ops.reduce((s, op) => s + op.prioritarias.length + op.demaisTotal, 0) };
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
