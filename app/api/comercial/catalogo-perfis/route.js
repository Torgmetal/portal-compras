import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { CATALOGO_PERFIS } from "@/lib/catalogo-perfis";

// GET — lista catalogo de perfis (auto-seed na primeira chamada)
export async function GET(req) {
  try {
    await requireRole(["ADMIN", "COMERCIAL"]);

    const count = await prisma.catalogoPerfilEstrutura.count();
    if (count === 0) {
      await prisma.catalogoPerfilEstrutura.createMany({
        data: CATALOGO_PERFIS,
        skipDuplicates: true,
      });
    }

    const { searchParams } = new URL(req.url);
    const categoria = searchParams.get("categoria");

    const where = { ativo: true };
    if (categoria) where.categoria = categoria;

    const itens = await prisma.catalogoPerfilEstrutura.findMany({
      where,
      orderBy: [{ categoria: "asc" }, { perfil: "asc" }],
    });

    return NextResponse.json({ success: true, data: itens });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
