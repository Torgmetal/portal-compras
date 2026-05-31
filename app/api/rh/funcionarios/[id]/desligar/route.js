import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

const desligarSchema = z.object({
  dataDemissao: z.string().min(1, "Data de demissão obrigatória"),
  tipoDesligamento: z.enum(
    ["VOLUNTARIO", "INVOLUNTARIO", "JUSTA_CAUSA", "TERMINO_CONTRATO"],
    { message: "Tipo de desligamento inválido" }
  ),
  categoriaDesligamento: z
    .enum([
      "OUTRO_EMPREGO",
      "INSATISFACAO",
      "CORTE",
      "DESEMPENHO",
      "DISCIPLINAR",
      "ACORDO",
      "OUTROS",
    ])
    .optional()
    .nullable(),
  motivoDesligamento: z.string().optional().nullable(),
});

// POST — Desligar funcionário
export async function POST(req, { params }) {
  try {
    const user = await requireRole(["ADMIN", "RH"]);
    const { id } = await params;
    const body = await req.json();

    const parsed = desligarSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Dados inválidos" },
        { status: 400 }
      );
    }

    const funcionario = await prisma.funcionario.findUnique({ where: { id } });
    if (!funcionario) {
      return NextResponse.json(
        { success: false, error: "Funcionário não encontrado" },
        { status: 404 }
      );
    }

    if (funcionario.status === "DEMITIDO") {
      return NextResponse.json(
        { success: false, error: "Funcionário já está desligado" },
        { status: 400 }
      );
    }

    const data = parsed.data;

    const atualizado = await prisma.funcionario.update({
      where: { id },
      data: {
        dataDemissao: new Date(data.dataDemissao),
        tipoDesligamento: data.tipoDesligamento,
        categoriaDesligamento: data.categoriaDesligamento || null,
        motivoDesligamento: data.motivoDesligamento || null,
        status: "DEMITIDO",
        ativo: false,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "DESLIGAR_FUNCIONARIO",
        entity: "Funcionario",
        entityId: id,
        diff: {
          antes: { status: funcionario.status, ativo: funcionario.ativo },
          depois: {
            status: "DEMITIDO",
            ativo: false,
            tipoDesligamento: data.tipoDesligamento,
            dataDemissao: data.dataDemissao,
          },
        },
      },
    });

    return NextResponse.json({ success: true, data: atualizado });
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
