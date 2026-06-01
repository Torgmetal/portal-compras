import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

const patchVagaSchema = z.object({
  titulo: z.string().min(2).optional(),
  status: z.enum(["SOLICITADA", "APROVADA", "EM_RECRUTAMENTO", "PREENCHIDA", "CANCELADA"]).optional(),
  dataAprovacao: z.string().optional().nullable(),
  dataFechamento: z.string().optional().nullable(),
  custoRecrutamento: z.number().optional().nullable(),
  observacaoRH: z.string().optional().nullable(),
  funcionarioContratadoNome: z.string().optional().nullable(),
  prioridade: z.enum(["URGENTE", "ALTA", "NORMAL", "BAIXA"]).optional().nullable(),
  quantidade: z.number().int().min(1).optional(),
  justificativa: z.string().optional().nullable(),
  requisitos: z.string().optional().nullable(),
  salarioFaixa: z.string().optional().nullable(),
});

// GET — Detalhe de uma vaga
export async function GET(req, { params }) {
  try {
    await requireRole(["ADMIN", "RH"]);
    const { id } = await params;

    const vaga = await prisma.vaga.findUnique({
      where: { id },
      include: {
        setor: { select: { id: true, nome: true } },
        cargo: { select: { id: true, nome: true } },
      },
    });

    if (!vaga) {
      return NextResponse.json(
        { success: false, error: "Vaga não encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: vaga });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}

// PATCH — Atualizar vaga
export async function PATCH(req, { params }) {
  try {
    const user = await requireRole(["ADMIN", "RH"]);
    const { id } = await params;
    const body = await req.json();

    const parsed = patchVagaSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Dados inválidos" },
        { status: 400 }
      );
    }

    const vaga = await prisma.vaga.findUnique({ where: { id } });
    if (!vaga) {
      return NextResponse.json(
        { success: false, error: "Vaga não encontrada" },
        { status: 404 }
      );
    }

    const data = { ...parsed.data };

    // Auto-set dataAprovacao when status changes to APROVADA
    if (data.status === "APROVADA" && vaga.status !== "APROVADA") {
      if (!data.dataAprovacao) {
        data.dataAprovacao = new Date().toISOString();
      }
    }

    // Auto-set dataFechamento when status changes to PREENCHIDA
    if (data.status === "PREENCHIDA" && vaga.status !== "PREENCHIDA") {
      if (!data.dataFechamento) {
        data.dataFechamento = new Date().toISOString();
      }
    }

    // Convert date strings to Date objects
    if (data.dataAprovacao) data.dataAprovacao = new Date(data.dataAprovacao);
    if (data.dataFechamento) data.dataFechamento = new Date(data.dataFechamento);

    const atualizada = await prisma.vaga.update({
      where: { id },
      data,
      include: {
        setor: { select: { id: true, nome: true } },
        cargo: { select: { id: true, nome: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "ATUALIZAR_VAGA",
        entity: "Vaga",
        entityId: id,
        diff: {
          antes: { status: vaga.status, titulo: vaga.titulo },
          depois: { status: atualizada.status, titulo: atualizada.titulo },
        },
      },
    });

    return NextResponse.json({ success: true, data: atualizada });
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

// DELETE — Cancelar ou excluir vaga
export async function DELETE(req, { params }) {
  try {
    const user = await requireRole(["ADMIN", "RH"]);
    const { id } = await params;

    const vaga = await prisma.vaga.findUnique({ where: { id } });
    if (!vaga) {
      return NextResponse.json(
        { success: false, error: "Vaga não encontrada" },
        { status: 404 }
      );
    }

    // Hard delete only if status is SOLICITADA (not yet approved)
    if (vaga.status === "SOLICITADA") {
      await prisma.vaga.delete({ where: { id } });

      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: "EXCLUIR_VAGA",
          entity: "Vaga",
          entityId: id,
          diff: { titulo: vaga.titulo, status: vaga.status },
        },
      });

      return NextResponse.json({ success: true, message: "Vaga excluída" });
    }

    // Soft delete — set status to CANCELADA
    const atualizada = await prisma.vaga.update({
      where: { id },
      data: { status: "CANCELADA" },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "CANCELAR_VAGA",
        entity: "Vaga",
        entityId: id,
        diff: {
          antes: { status: vaga.status },
          depois: { status: "CANCELADA" },
        },
      },
    });

    return NextResponse.json({ success: true, data: atualizada });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
