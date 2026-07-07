// GET /api/comercial/orcamento-servico/perfis — catálogo de perfis (kg/m) p/ o
// cálculo de peso do corte/furação. Só ADMIN/COMERCIAL.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  try { await requireRole(["ADMIN", "COMERCIAL"]); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const perfis = await prisma.catalogoPerfilEstrutura.findMany({
    where: { ativo: true },
    orderBy: [{ categoria: "asc" }, { perfil: "asc" }],
    select: { categoria: true, perfil: true, pesoKgM: true },
  });
  return NextResponse.json({ success: true, perfis });
}
