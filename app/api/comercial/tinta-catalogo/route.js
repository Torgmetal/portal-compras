import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { CATALOGO_TINTAS, RESINAS } from "@/lib/tinta-catalogo";

// ── GET ── Lista produtos do catálogo de tintas
export async function GET() {
  try {
    await requireRole(["ADMIN", "COMERCIAL"]);

    let produtos = await prisma.tintaProduto.findMany({
      where: { ativo: true },
      orderBy: [{ resinaTipo: "asc" }, { nome: "asc" }],
    });

    // Se catálogo vazio, popular automaticamente na primeira chamada
    if (produtos.length === 0) {
      const dados = CATALOGO_TINTAS.map((t) => ({
        nome: t.nome,
        fabricante: t.fabricante || null,
        norma: t.norma || null,
        resinaTipo: t.resinaTipo,
        svPct: t.svPct,
        diluentePct: RESINAS[t.resinaTipo]?.diluentePct ?? 10,
      }));

      await prisma.tintaProduto.createMany({ data: dados });

      produtos = await prisma.tintaProduto.findMany({
        where: { ativo: true },
        orderBy: [{ resinaTipo: "asc" }, { nome: "asc" }],
      });
    }

    return NextResponse.json({ success: true, data: produtos });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
