// GET /api/engenharia/listas/destinatarios — usuários ativos da Torg (equipe
// interna, exclui funcionário self-service) pro seletor de quem recebe o aviso
// de revisão de lista. Mesmo critério do seletor de CC dos relatórios.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  try { await requireRole(["ADMIN", "ENGENHARIA", "PCP", "PLANEJAMENTO", "PRODUCAO"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const users = await prisma.user.findMany({
    where: { ativo: true, tipo: { not: "FUNCIONARIO" } },
    select: { name: true, email: true, setor: true },
    orderBy: [{ setor: "asc" }, { name: "asc" }],
  });
  const seen = new Set();
  const destinatarios = [];
  for (const u of users) {
    const e = (u.email || "").trim().toLowerCase();
    if (!e || e.endsWith("@funcionario.torg") || seen.has(e)) continue;
    seen.add(e);
    destinatarios.push({ nome: u.name || u.email, email: u.email, setor: u.setor || null });
  }
  return NextResponse.json({ destinatarios });
}
