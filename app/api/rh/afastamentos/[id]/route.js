import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

const patchSchema = z.object({
  dataFim: z.string().optional().nullable(),
  diasAfastado: z.number().optional().nullable(),
  status: z.enum(["EM_ANDAMENTO", "ENCERRADO"]).optional(),
  inss: z.boolean().optional().nullable(),
  categoriaCID: z.string().optional().nullable(),
  observacao: z.string().optional().nullable(),
});

// PATCH — Atualizar afastamento (encerrar, editar campos)
export async function PATCH(req, { params }) {
  try {
    const user = await requireRole(["ADMIN", "RH"]);
    const { id } = await params;
    const body = await req.json();

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Dados inválidos" },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Buscar afastamento atual
    const atual = await prisma.afastamento.findUnique({ where: { id } });
    if (!atual) {
      return NextResponse.json(
        { success: false, error: "Afastamento não encontrado" },
        { status: 404 }
      );
    }

    // Preparar campos de update
    const updateData = {};

    if (data.dataFim !== undefined) {
      updateData.dataFim = data.dataFim ? new Date(data.dataFim) : null;
    }
    if (data.inss !== undefined) updateData.inss = data.inss;
    if (data.categoriaCID !== undefined) updateData.categoriaCID = data.categoriaCID;
    if (data.observacao !== undefined) updateData.observacao = data.observacao;
    if (data.status !== undefined) updateData.status = data.status;

    // Se encerrando, calcular diasAfastado se não fornecido
    const novoStatus = data.status || atual.status;
    if (novoStatus === "ENCERRADO" && (data.dataFim || atual.dataFim)) {
      if (data.diasAfastado !== undefined && data.diasAfastado !== null) {
        updateData.diasAfastado = data.diasAfastado;
      } else {
        const inicio = atual.dataInicio;
        const fim = data.dataFim ? new Date(data.dataFim) : atual.dataFim;
        if (fim) {
          updateData.diasAfastado = Math.ceil((fim - inicio) / (1000 * 60 * 60 * 24));
        }
      }
    }

    const afastamento = await prisma.afastamento.update({
      where: { id },
      data: updateData,
    });

    // Se encerrando, verificar se funcionário pode voltar para ATIVO
    if (novoStatus === "ENCERRADO" && atual.status === "EM_ANDAMENTO") {
      const outrosAbertos = await prisma.afastamento.count({
        where: {
          funcionarioId: atual.funcionarioId,
          status: "EM_ANDAMENTO",
          id: { not: id },
        },
      });

      if (outrosAbertos === 0) {
        await prisma.funcionario.update({
          where: { id: atual.funcionarioId },
          data: { status: "ATIVO" },
        });
      }
    }

    // AuditLog
    try {
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: "ATUALIZAR_AFASTAMENTO",
          entity: "Afastamento",
          entityId: id,
          diff: { antes: { status: atual.status }, depois: updateData },
        },
      });
    } catch (_) {}

    return NextResponse.json({ success: true, data: afastamento });
  } catch (e) {
    if (e.issues) {
      return NextResponse.json(
        { success: false, error: e.issues[0]?.message },
        { status: 400 }
      );
    }
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}

// DELETE — Excluir afastamento
export async function DELETE(req, { params }) {
  try {
    const user = await requireRole(["ADMIN", "RH"]);
    const { id } = await params;

    const afastamento = await prisma.afastamento.findUnique({ where: { id } });
    if (!afastamento) {
      return NextResponse.json(
        { success: false, error: "Afastamento não encontrado" },
        { status: 404 }
      );
    }

    await prisma.afastamento.delete({ where: { id } });

    // AuditLog
    try {
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: "EXCLUIR_AFASTAMENTO",
          entity: "Afastamento",
          entityId: id,
          diff: {
            funcionarioId: afastamento.funcionarioId,
            natureza: afastamento.natureza,
            status: afastamento.status,
          },
        },
      });
    } catch (_) {}

    return NextResponse.json({ success: true });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
