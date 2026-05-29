import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

// GET — Dados do organograma (setores + funcionários agrupados)
export async function GET() {
  try {
    await requireRole(["ADMIN", "RH"]);

    const setores = await prisma.setor.findMany({
      where: { ativo: true },
      select: {
        id: true,
        nome: true,
        sigla: true,
        cor: true,
        gestor: {
          select: {
            id: true,
            nome: true,
            foto: true,
            cargo: { select: { id: true, nome: true } },
          },
        },
        funcionarios: {
          where: { ativo: true },
          select: {
            id: true,
            nome: true,
            foto: true,
            status: true,
            cargo: { select: { id: true, nome: true } },
          },
          orderBy: { nome: "asc" },
        },
      },
      orderBy: { nome: "asc" },
    });

    // Contagem geral
    const totalFuncionarios = await prisma.funcionario.count({ where: { ativo: true } });
    const totalSetores = setores.length;

    return NextResponse.json({
      success: true,
      data: {
        empresa: "Torg Metal",
        totalFuncionarios,
        totalSetores,
        setores,
      },
    });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
