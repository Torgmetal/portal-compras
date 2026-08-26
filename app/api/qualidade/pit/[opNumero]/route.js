// GET  /api/qualidade/pit/{opNumero}       → o padrão escolhido da obra + as opções
// PUT  /api/qualidade/pit/{opNumero}       → grava o padrão
// GET  /api/qualidade/pit/{opNumero}/excel → o PIT no padrão Torg
//
// Vitor (26/08/2026): "o PIT nasce com a proposta — vamos informar qual o padrão que vamos usar na
// criação da proposta"; e depois: "também pode ser selecionado na aba da qualidade, igual vamos
// fazer no PLP".
//
// ⚠ O PADRÃO FICA NA OP, não num documento. É decisão DA OBRA: o PIT sai dele hoje, e o escopo de
// inspeção e o Data Book podem sair amanhã. Guardar no documento faria a segunda tela ter de
// adivinhar de novo.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { PIT_PADROES, PIT_PADRAO } from "@/lib/pit-padroes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES = ["ADMIN", "QUALIDADE", "COMERCIAL", "PRODUCAO", "PCP"];
const numDaRota = async (params) => String((await params)?.opNumero || "").replace(/\D/g, "").padStart(3, "0");

export async function GET(req, { params }) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const opNumero = await numDaRota(params);
  const op = await prisma.oP.findFirst({
    where: { numero: opNumero },
    select: { numero: true, cliente: true, obra: true, refCliente: true, pitPadrao: true, pitRevisao: true },
  });
  if (!op) return NextResponse.json({ error: "OP não encontrada." }, { status: 404 });

  return NextResponse.json({
    op,
    padrao: op.pitPadrao || null,
    revisao: op.pitRevisao || "0",
    // ⚠ vai o RESUMO de cada padrão junto: escolher entre cinco siglas sem saber o que muda é como
    // a Qualidade acaba emitindo o PIT errado — e o errado só aparece na auditoria do cliente.
    opcoes: PIT_PADROES.map((p) => ({ id: p.id, nome: p.nome, resumo: p.resumo, itens: p.linhas.length })),
  });
}

export async function PUT(req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "QUALIDADE", "COMERCIAL"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const opNumero = await numDaRota(params);
  const { padrao, revisao } = await req.json().catch(() => ({}));
  if (padrao && !PIT_PADRAO[padrao]) return NextResponse.json({ error: "Padrão de PIT desconhecido." }, { status: 400 });

  const op = await prisma.oP.findFirst({ where: { numero: opNumero }, select: { id: true, pitPadrao: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada." }, { status: 404 });

  await prisma.oP.update({
    where: { id: op.id },
    data: { pitPadrao: padrao || null, pitRevisao: String(revisao ?? "").trim().slice(0, 10) || null },
  });
  // ⚠ trocar o padrão de PIT muda o que a Qualidade vai inspecionar na obra inteira — fica no log.
  await prisma.auditLog.create({
    data: { userId: user?.id || null, action: "PIT_PADRAO", entity: "OP", entityId: op.id,
      diff: { op: opNumero, de: op.pitPadrao || null, para: padrao || null } },
  }).catch(() => {});

  return NextResponse.json({ ok: true, padrao: padrao || null });
}
