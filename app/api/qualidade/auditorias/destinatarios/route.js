// GET /api/qualidade/auditorias/destinatarios — usuários internos da Torg para CC do e-mail
// do portal de auditoria (várias áreas envolvidas). ADMIN/QUALIDADE. Ativos, exceto os de
// autoatendimento (FUNCIONARIO). Só nome/e-mail/setor — nada sensível.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }
  const usuarios = await prisma.user.findMany({
    where: { ativo: true, tipo: { not: "FUNCIONARIO" }, email: { not: "" } },
    select: { id: true, name: true, email: true, setor: true },
    orderBy: [{ setor: "asc" }, { name: "asc" }],
  });
  return NextResponse.json({ success: true, usuarios });
}
