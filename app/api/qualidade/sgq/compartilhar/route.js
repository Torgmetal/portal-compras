// Links de compartilhamento externo do SGQ (token → pastas específicas, só PDFs, com validade).
// GET lista · POST cria · DELETE revoga. ADMIN/QUALIDADE.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { gerarTokenForte } from "@/lib/token";

export const runtime = "nodejs";

export async function GET() {
  try { await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const shares = await prisma.compartilhamentoSGQ.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ shares });
}

export async function POST(req) {
  let user;
  try { user = await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const body = await req.json().catch(() => ({}));
  const nome = String(body?.nome || "").trim();
  const pastas = Array.isArray(body?.pastas) ? [...new Set(body.pastas.map((p) => String(p).replace(/^\/+|\/+$/g, "")).filter(Boolean))] : [];
  const expiraEm = body?.expiraEm ? new Date(body.expiraEm) : null;
  if (nome.length < 2) return NextResponse.json({ error: "Dê um nome ao link (ex.: Auditor BVQI)." }, { status: 400 });
  if (!pastas.length) return NextResponse.json({ error: "Selecione ao menos uma pasta." }, { status: 400 });
  if (expiraEm && isNaN(expiraEm)) return NextResponse.json({ error: "Data de validade inválida." }, { status: 400 });

  const share = await prisma.compartilhamentoSGQ.create({
    data: { token: gerarTokenForte(24), nome, pastas, expiraEm, criadoPorId: user.id || null },
  });
  return NextResponse.json({ share });
}

export async function DELETE(req) {
  try { await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  await prisma.compartilhamentoSGQ.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
