import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

const afastamentoSchema = z.object({
  funcionarioId: z.string().min(1, "Funcionário obrigatório"),
  dataInicio: z.string().min(1, "Data de início obrigatória"),
  dataFim: z.string().optional().nullable(),
  natureza: z.enum(
    ["FISICO", "MENTAL", "ACIDENTE_TRABALHO", "ACIDENTE_TRAJETO", "MATERNIDADE", "PATERNIDADE"],
    { message: "Natureza inválida" }
  ),
  categoriaCID: z.string().optional().nullable(),
  inss: z.boolean().optional().nullable(),
  observacao: z.string().optional().nullable(),
});

// GET — Lista afastamentos
export async function GET(req) {
  try {
    await requireRole(["ADMIN", "RH"]);

    const { searchParams } = new URL(req.url);
    const funcionarioId = searchParams.get("funcionarioId");
    const natureza = searchParams.get("natureza");
    const status = searchParams.get("status");

    const where = {};
    if (funcionarioId) where.funcionarioId = funcionarioId;
    if (natureza) where.natureza = natureza;
    if (status) where.status = status;

    const afastamentos = await prisma.afastamento.findMany({
      where,
      include: {
        funcionario: {
          select: {
            id: true,
            nome: true,
            setor: { select: { id: true, nome: true } },
          },
        },
      },
      orderBy: { dataInicio: "desc" },
    });

    return NextResponse.json({ success: true, data: afastamentos });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}

// POST — Criar afastamento
export async function POST(req) {
  try {
    const user = await requireRole(["ADMIN", "RH"]);
    const body = await req.json();

    const parsed = afastamentoSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Dados inválidos" },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Calcular dias e status
    let diasAfastado = null;
    let statusAfastamento = "EM_ANDAMENTO";

    if (data.dataFim) {
      const inicio = new Date(data.dataInicio);
      const fim = new Date(data.dataFim);
      diasAfastado = Math.ceil((fim - inicio) / (1000 * 60 * 60 * 24));
      statusAfastamento = "ENCERRADO";
    }

    const afastamento = await prisma.afastamento.create({
      data: {
        funcionarioId: data.funcionarioId,
        dataInicio: new Date(data.dataInicio),
        dataFim: data.dataFim ? new Date(data.dataFim) : null,
        natureza: data.natureza,
        categoriaCID: data.categoriaCID || null,
        inss: data.inss || false,
        observacao: data.observacao || null,
        diasAfastado,
        status: statusAfastamento,
      },
    });

    // Se em andamento, atualizar status do funcionário para AFASTADO
    if (statusAfastamento === "EM_ANDAMENTO") {
      await prisma.funcionario.update({
        where: { id: data.funcionarioId },
        data: { status: "AFASTADO" },
      });
    }

    // AuditLog
    try {
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: "CRIAR_AFASTAMENTO",
          entity: "Afastamento",
          entityId: afastamento.id,
          diff: {
            funcionarioId: data.funcionarioId,
            natureza: data.natureza,
            dataInicio: data.dataInicio,
            status: statusAfastamento,
          },
        },
      });
    } catch (_) {}

    return NextResponse.json({ success: true, data: afastamento }, { status: 201 });
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
