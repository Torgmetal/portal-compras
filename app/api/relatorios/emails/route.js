// GET /api/relatorios/emails — e-mails cadastrados da Torg (equipe interna), para
// o seletor de cópia (CC) do envio de relatório. Exclui contas de funcionário
// (self-service) e e-mails sintéticos.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { MODS_RELATORIOS } from "@/lib/relatorios";

export const runtime = "nodejs";

export async function GET() {
  try { await requireRole(MODS_RELATORIOS); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const users = await prisma.user.findMany({
    where: { ativo: true, tipo: { not: "FUNCIONARIO" } }, // User.email é obrigatório
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
