import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

export async function PATCH(req, { params }) {
  try {
    await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;
    const body = await req.json();
    const data = {};
    if (typeof body.nome === "string") data.nome = body.nome;
    if (["CADASTRAL", "PORTFOLIO", "OUTRO"].includes(body.tipo)) data.tipo = body.tipo;
    if (typeof body.ativo === "boolean") data.ativo = body.ativo;
    if (Number.isInteger(body.ordem)) data.ordem = body.ordem;
    const doc = await prisma.documentoInstitucional.update({ where: { id }, data });
    return NextResponse.json({ success: true, doc });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}

export async function DELETE(req, { params }) {
  try {
    await requireRole(["ADMIN", "COMERCIAL"]);
    const { id } = await params;
    await prisma.documentoInstitucional.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
