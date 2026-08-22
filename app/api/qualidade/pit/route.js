// GET  — o escopo de ensaios da OP (o PIT dizendo o que cada relatório deve ter).
// PATCH — grava as escolhas.
//
// ⚠ O ESCOPO MORA NO PIT QUE JÁ EXISTE: a §10 do data book, em `DataBookSecao.conteudoJson`. Não há
// segundo cadastro — um segundo lugar para dizer a mesma coisa é um lugar que diverge.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { PERFIS_CAMPO } from "@/lib/qualidade-campo";

export const runtime = "nodejs";

async function secaoDoPIT(opNumero) {
  const book = await prisma.dataBookQualidade.findFirst({ where: { opNumero }, select: { id: true } });
  if (!book) return null;
  return prisma.dataBookSecao.findFirst({
    where: { dataBookId: book.id, numero: "10" },
    select: { id: true, conteudoJson: true },
  });
}

export async function GET(req) {
  try { await requireRole([...PERFIS_CAMPO, "ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const opNumero = String(new URL(req.url).searchParams.get("opNumero") || "").trim();
  if (!opNumero) return NextResponse.json({ escopo: null });

  const secao = await secaoDoPIT(opNumero);
  // ⚠ sem data book ainda, devolve vazio em vez de erro: o relatório continua funcionando com os
  // padrões, e a obra que ainda não tem PIT não fica impedida de inspecionar.
  return NextResponse.json({
    temPIT: !!secao,
    escopo: secao?.conteudoJson?.escopo || null,
  });
}

export async function PATCH(req) {
  let user;
  try { user = await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const body = await req.json().catch(() => ({}));
  const opNumero = String(body?.opNumero || "").trim();
  if (!opNumero) return NextResponse.json({ error: "Informe a OP." }, { status: 400 });

  const secao = await secaoDoPIT(opNumero);
  if (!secao) return NextResponse.json({ error: `A OP-${opNumero} ainda não tem data book com a seção 10 (PIT).` }, { status: 404 });

  const atual = secao.conteudoJson || {};
  const escopo = body?.escopo && typeof body.escopo === "object" ? body.escopo : {};

  // ⚠ preserva os ITENS da tabela do PIT: o escopo é um bloco ao lado, não um substituto. Gravar só
  // o escopo apagaria o plano de inspeção inteiro.
  const conteudoJson = { ...atual, escopo };
  await prisma.dataBookSecao.update({ where: { id: secao.id }, data: { conteudoJson } });

  await prisma.auditLog.create({
    data: { userId: user.id, action: "EDITAR_ESCOPO_PIT", entity: "DataBookSecao", entityId: secao.id, diff: { opNumero, escopo } },
  }).catch(() => {});

  return NextResponse.json({ ok: true, escopo });
}
