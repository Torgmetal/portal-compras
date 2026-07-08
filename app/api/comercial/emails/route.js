// GET /api/comercial/emails — e-mails da equipe COMERCIAL, para o seletor de
// cópia (CC) no envio da proposta. Só o comercial; os demais setores entram
// manualmente pelo campo de adicionar e-mail. Exclui contas de funcionário.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  try { await requireRole(["ADMIN", "COMERCIAL"]); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const users = await prisma.user.findMany({
    where: { ativo: true, tipo: { not: "FUNCIONARIO" }, modulos: { some: { modulo: "COMERCIAL" } } },
    select: { name: true, email: true },
    orderBy: { name: "asc" },
  });
  const seen = new Set();
  const emails = [];
  for (const u of users) {
    const e = (u.email || "").trim().toLowerCase();
    if (!e || e.endsWith("@funcionario.torg") || seen.has(e)) continue;
    seen.add(e);
    emails.push({ nome: u.name || u.email, email: u.email });
  }
  return NextResponse.json({ success: true, emails });
}
