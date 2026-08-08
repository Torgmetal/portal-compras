import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

// GET — Dados do organograma (setores + funcionários agrupados)
export async function GET() {
  try {
    await requireRole(["ADMIN", "RH"]);

    const setoresTodos = await prisma.setor.findMany({
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

    // Não mostra no organograma os setores sem colaboradores — exceto Compras, que é
    // fundamental e fica visível mesmo vazio (Vitor 08/08).
    const setores = setoresTodos.filter((s) => s.funcionarios.length > 0 || /compras/i.test(s.nome));

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
