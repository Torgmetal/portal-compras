// Matriz de Competências (FORM-11 / ISO 9001 §7.2) — lista os cargos com o estado
// da matriz (descrição, competências vinculadas, nº de funcionários, revisão).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  try { await requireRole(["ADMIN", "RH"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const cargos = await prisma.cargo.findMany({
    where: { ativo: true },
    orderBy: [{ nome: "asc" }],
    select: {
      id: true, nome: true, nivel: true, categoria: true, area: true, descricao: true, matriz: true,
      _count: { select: { competencias: true, funcionarios: true } },
    },
  });

  const lista = cargos.map((c) => ({
    id: c.id, nome: c.nome, nivel: c.nivel, categoria: c.categoria,
    area: c.area || "Sem área",
    temDescricao: !!(c.descricao && c.descricao.trim()),
    nComp: c._count.competencias,
    nFunc: c._count.funcionarios,
    temMatriz: c._count.competencias > 0,
    revisao: c.matriz?.revisao || null,
  }));

  return NextResponse.json({
    cargos: lista,
    resumo: {
      total: lista.length,
      comMatriz: lista.filter((c) => c.temMatriz).length,
      comDescricao: lista.filter((c) => c.temDescricao).length,
    },
  });
}
