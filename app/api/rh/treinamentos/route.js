import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

const treinamentoSchema = z.object({
  titulo: z.string().min(2, "Título obrigatório (mín. 2 caracteres)"),
  tipo: z.enum(
    ["NR_OBRIGATORIO", "TECNICO", "COMPORTAMENTAL", "INTEGRACAO", "SST"],
    { message: "Tipo inválido" }
  ),
  nrRelacionada: z.string().optional().nullable(),
  descricao: z.string().optional().nullable(),
  instrutor: z.string().optional().nullable(),
  local: z.string().optional().nullable(),
  dataInicio: z.string().min(1, "Data de início obrigatória"),
  dataFim: z.string().optional().nullable(),
  cargaHoraria: z.number().min(0.5, "Carga horária mínima: 0.5h"),
  validadeMeses: z.number().int().optional().nullable(),
  custo: z.number().optional().nullable(),
  participantesIds: z.array(z.string()).optional().nullable(),
});

// GET — Lista treinamentos
export async function GET(req) {
  try {
    await requireRole(["ADMIN", "RH"]);

    const { searchParams } = new URL(req.url);
    const tipo = searchParams.get("tipo");
    const ano = searchParams.get("ano");

    const where = {};
    if (tipo) where.tipo = tipo;
    if (ano) {
      const anoNum = parseInt(ano);
      where.dataInicio = {
        gte: new Date(`${anoNum}-01-01`),
        lt: new Date(`${anoNum + 1}-01-01`),
      };
    }

    const treinamentos = await prisma.treinamento.findMany({
      where,
      orderBy: { dataInicio: "desc" },
      include: {
        _count: { select: { participantes: true } },
      },
    });

    return NextResponse.json({ success: true, data: treinamentos });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}

// POST — Criar treinamento
export async function POST(req) {
  try {
    const user = await requireRole(["ADMIN", "RH"]);
    const body = await req.json();

    const parsed = treinamentoSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Dados inválidos" },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const participantesIds = data.participantesIds || [];

    // Criar treinamento
    const treinamento = await prisma.treinamento.create({
      data: {
        titulo: data.titulo,
        tipo: data.tipo,
        nrRelacionada: data.nrRelacionada || null,
        descricao: data.descricao || null,
        instrutor: data.instrutor || null,
        local: data.local || null,
        dataInicio: new Date(data.dataInicio),
        dataFim: data.dataFim ? new Date(data.dataFim) : null,
        cargaHoraria: data.cargaHoraria,
        validadeMeses: data.validadeMeses || null,
        custo: data.custo || null,
      },
    });

    // Criar participantes se fornecidos
    if (participantesIds.length > 0) {
      const dataInicio = new Date(data.dataInicio);

      const participantesData = participantesIds.map((funcionarioId) => {
        const entry = {
          treinamentoId: treinamento.id,
          funcionarioId,
        };

        // Calcular vencimento se validadeMeses definido
        if (data.validadeMeses) {
          const vencimento = new Date(dataInicio);
          vencimento.setMonth(vencimento.getMonth() + data.validadeMeses);
          entry.dataVencimento = vencimento;
        }

        return entry;
      });

      await prisma.treinamentoParticipante.createMany({
        data: participantesData,
      });
    }

    // AuditLog
    try {
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: "CRIAR_TREINAMENTO",
          entity: "Treinamento",
          entityId: treinamento.id,
          diff: {
            titulo: data.titulo,
            tipo: data.tipo,
            cargaHoraria: data.cargaHoraria,
            participantes: participantesIds.length,
          },
        },
      });
    } catch (_) {}

    return NextResponse.json({ success: true, data: treinamento }, { status: 201 });
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
