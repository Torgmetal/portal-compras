// POST   /api/qualidade/auditorias/[id]/publicar  — publica e gera o link do portal do cliente
// DELETE /api/qualidade/auditorias/[id]/publicar   — despublica (volta a RASCUNHO; o link para de abrir)
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { gerarTokenForte } from "@/lib/token";

export const runtime = "nodejs";

function linkDoPortal(req, token) {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const base = (process.env.NEXTAUTH_URL && process.env.NEXTAUTH_URL.startsWith("http")) ? process.env.NEXTAUTH_URL : (host ? `https://${host}` : "");
  return `${base}/portal-cliente/${token}`;
}

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }
  const aud = await prisma.auditoria.findUnique({ where: { id: params.id }, select: { token: true } });
  if (!aud) return NextResponse.json({ success: false, error: "Auditoria não encontrada" }, { status: 404 });
  const token = aud.token || gerarTokenForte(32);
  await prisma.auditoria.update({ where: { id: params.id }, data: { token, status: "PUBLICADO", publicadoEm: new Date() } });
  await prisma.auditLog.create({ data: { userId: user.id, action: "PUBLICAR_AUDITORIA", entity: "Auditoria", entityId: params.id, diff: {} } }).catch(() => {});
  return NextResponse.json({ success: true, link: linkDoPortal(req, token), token });
}

export async function DELETE(_req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }
  await prisma.auditoria.update({ where: { id: params.id }, data: { status: "RASCUNHO" } }).catch(() => {});
  await prisma.auditLog.create({ data: { userId: user.id, action: "DESPUBLICAR_AUDITORIA", entity: "Auditoria", entityId: params.id, diff: {} } }).catch(() => {});
  return NextResponse.json({ success: true });
}
