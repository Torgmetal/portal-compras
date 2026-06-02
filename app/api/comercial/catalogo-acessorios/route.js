import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { CATALOGO_ACESSORIOS } from "@/lib/catalogo-acessorios";

// GET — lista catalogo (auto-seed na primeira chamada)
export async function GET(req) {
  try {
    await requireRole(["ADMIN", "COMERCIAL"]);

    const count = await prisma.catalogoProdutoAcessorio.count();
    if (count === 0) {
      await prisma.catalogoProdutoAcessorio.createMany({
        data: CATALOGO_ACESSORIOS,
        skipDuplicates: true,
      });
    }

    const { searchParams } = new URL(req.url);
    const categoria = searchParams.get("categoria");

    const where = { ativo: true };
    if (categoria) where.categoria = categoria;

    const itens = await prisma.catalogoProdutoAcessorio.findMany({
      where,
      orderBy: [{ categoria: "asc" }, { nome: "asc" }],
    });

    return NextResponse.json({ success: true, data: itens });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
