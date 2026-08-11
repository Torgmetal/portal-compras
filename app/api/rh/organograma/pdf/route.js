// GET /api/rh/organograma/pdf — organograma em PDF (padrão Torg). ADMIN/RH.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { gerarOrganogramaPDF } from "@/lib/organograma-pdf";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  try { await requireRole(["ADMIN", "RH"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const setoresTodos = await prisma.setor.findMany({
    where: { ativo: true },
    select: {
      id: true, nome: true, sigla: true, cor: true,
      gestor: { select: { nome: true, cargo: { select: { nome: true } } } },
      funcionarios: {
        where: { ativo: true },
        select: { nome: true, status: true, cargo: { select: { nome: true } } },
        orderBy: { nome: "asc" },
      },
    },
    orderBy: { nome: "asc" },
  });
  // Mesmo filtro da tela: esconde setores vazios, exceto Compras.
  const setores = setoresTodos.filter((s) => s.funcionarios.length > 0 || /compras/i.test(s.nome));
  const totalFuncionarios = await prisma.funcionario.count({ where: { ativo: true } });

  const bytes = await gerarOrganogramaPDF({ empresa: "Torg Metal", totalSetores: setores.length, totalFuncionarios, setores });

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Organograma - Torg Metal.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
