import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import crypto from "crypto";

export const runtime = "nodejs";

export async function GET(req, { params }) {
  try {
    await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;
    const [apresentacao, biblioteca] = await Promise.all([
      prisma.apresentacaoCliente.findUnique({ where: { id }, include: { documentos: { orderBy: { ordem: "asc" } } } }),
      prisma.documentoInstitucional.findMany({ where: { ativo: true }, orderBy: [{ tipo: "asc" }, { ordem: "asc" }] }),
    ]);
    if (!apresentacao) return NextResponse.json({ success: false, error: "Não encontrada" }, { status: 404 });
    return NextResponse.json({ success: true, apresentacao, biblioteca });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}

export async function PATCH(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMERCIAL"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
  const { id } = await params;
  const body = await req.json();
  const data = {};
  if (typeof body.contato === "string") data.contato = body.contato;
  if (typeof body.empresa === "string") data.empresa = body.empresa;
  if ("mensagemBoasVindas" in body) data.mensagemBoasVindas = body.mensagemBoasVindas || null;
  if ("clienteEmail" in body) data.clienteEmail = body.clienteEmail || null;
  if ("capaUrl" in body) data.capaUrl = body.capaUrl || null;
  if (Array.isArray(body.docsInstitucionaisIds)) data.docsInstitucionaisIds = body.docsInstitucionaisIds.filter((x) => typeof x === "string");

  // Publicar / despublicar
  if (body.acao === "publicar") {
    const atual = await prisma.apresentacaoCliente.findUnique({ where: { id }, select: { token: true } });
    data.status = "PUBLICADO";
    data.publicadoEm = new Date();
    if (!atual?.token) data.token = crypto.randomBytes(18).toString("base64url");
  } else if (body.acao === "despublicar") {
    data.status = "RASCUNHO";
  }

  const apresentacao = await prisma.apresentacaoCliente.update({ where: { id }, data });
  if (body.acao) {
    await prisma.auditLog.create({ data: { userId: user.id, action: body.acao === "publicar" ? "PUBLICAR_APRESENTACAO" : "DESPUBLICAR_APRESENTACAO", entity: "ApresentacaoCliente", entityId: id, diff: { empresa: apresentacao.empresa } } });
  }
  return NextResponse.json({ success: true, apresentacao });
}

export async function DELETE(req, { params }) {
  try {
    await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;
    await prisma.apresentacaoCliente.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
