// GET  — histórico de revisões do data book
// POST — abre uma nova revisão { motivo }
//
// Vitor (19/08/2026): "sempre depois de emitido você não deve permitir salvar sem gerar uma
// revisão; e se for revisão, fazer o histórico da revisão e enviar para assinatura de todos
// novamente".
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { abrirRevisao, rotuloRevisao } from "@/lib/databook-revisao";

export const runtime = "nodejs";

export async function GET(_req, { params }) {
  try { await requireRole(["ADMIN", "QUALIDADE", "PRODUCAO", "ENGENHARIA", "COMERCIAL"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { id } = await params;
  const [book, revisoes] = await Promise.all([
    prisma.dataBookQualidade.findUnique({ where: { id }, select: { revisao: true, status: true, emitidoEm: true } }),
    prisma.dataBookRevisao.findMany({ where: { dataBookId: id }, orderBy: { revisao: "desc" } }),
  ]);
  if (!book) return NextResponse.json({ error: "Data book não encontrado" }, { status: 404 });

  return NextResponse.json({
    revisaoAtual: book.revisao || 0,
    rotulo: rotuloRevisao(book.revisao),
    status: book.status,
    revisoes: revisoes.map((r) => ({
      ...r, rotulo: rotuloRevisao(r.revisao), rotuloAnterior: rotuloRevisao(r.revisaoAnterior),
    })),
  });
}

export async function POST(req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { id } = await params;
  let body = {};
  try { body = await req.json(); } catch { /* motivo obrigatório cai na validação abaixo */ }

  try {
    const r = await abrirRevisao(id, { motivo: body?.motivo, userId: user.id, userNome: user.name || null });
    await prisma.auditLog.create({
      data: { userId: user.id, action: "ABRIR_REVISAO_DATABOOK", entity: "DataBookQualidade", entityId: id, diff: { revisao: r.revisao, motivo: body?.motivo } },
    }).catch(() => {});
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 500 });
  }
}
