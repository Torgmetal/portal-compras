import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

const acidenteSchema = z.object({
  data: z.string().min(1, "Data obrigatória"),
  hora: z.string().optional().nullable(),
  setorId: z.string().optional().nullable(),
  obra: z.string().optional().nullable(),
  tipo: z.enum(
    ["COM_AFASTAMENTO", "SEM_AFASTAMENTO", "TRAJETO", "QUASE_ACIDENTE"],
    { message: "Tipo inválido" }
  ),
  gravidade: z.enum(["LEVE", "MODERADO", "GRAVE", "FATAL"]).optional().default("LEVE"),
  diasPerdidos: z.number().int().optional().default(0),
  funcionarioNome: z.string().optional().nullable(),
  funcionarioId: z.string().optional().nullable(),
  descricao: z.string().min(5, "Descrição deve ter no mínimo 5 caracteres"),
  causaRaiz: z.string().optional().nullable(),
  parteCorpo: z.string().optional().nullable(),
  agenteRisco: z.string().optional().nullable(),
  catEmitida: z.boolean().optional().nullable(),
  catNumero: z.string().optional().nullable(),
  acaoCorretiva: z.string().optional().nullable(),
  responsavelAcao: z.string().optional().nullable(),
  prazoAcao: z.string().optional().nullable(),
});

// GET — Lista acidentes de trabalho
export async function GET(req) {
  try {
    await requireRole(["ADMIN", "RH"]);

    const { searchParams } = new URL(req.url);
    const setorId = searchParams.get("setorId");
    const tipo = searchParams.get("tipo");
    const ano = searchParams.get("ano");

    const where = {};
    if (setorId) where.setorId = setorId;
    if (tipo) where.tipo = tipo;
    if (ano) {
      const anoNum = parseInt(ano);
      where.data = {
        gte: new Date(`${anoNum}-01-01`),
        lt: new Date(`${anoNum + 1}-01-01`),
      };
    }

    const acidentes = await prisma.acidenteTrabalho.findMany({
      where,
      orderBy: { data: "desc" },
    });

    return NextResponse.json({ success: true, data: acidentes });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}

// POST — Registrar acidente
export async function POST(req) {
  try {
    const user = await requireRole(["ADMIN", "RH"]);
    const body = await req.json();

    const parsed = acidenteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Dados inválidos" },
        { status: 400 }
      );
    }

    const data = parsed.data;

    const acidente = await prisma.acidenteTrabalho.create({
      data: {
        data: new Date(data.data),
        hora: data.hora || null,
        setorId: data.setorId || null,
        obra: data.obra || null,
        tipo: data.tipo,
        gravidade: data.gravidade,
        diasPerdidos: data.diasPerdidos,
        funcionarioNome: data.funcionarioNome || null,
        funcionarioId: data.funcionarioId || null,
        descricao: data.descricao,
        causaRaiz: data.causaRaiz || null,
        parteCorpo: data.parteCorpo || null,
        agenteRisco: data.agenteRisco || null,
        catEmitida: data.catEmitida || false,
        catNumero: data.catNumero || null,
        acaoCorretiva: data.acaoCorretiva || null,
        responsavelAcao: data.responsavelAcao || null,
        prazoAcao: data.prazoAcao ? new Date(data.prazoAcao) : null,
      },
    });

    // AuditLog
    try {
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: "REGISTRAR_ACIDENTE",
          entity: "AcidenteTrabalho",
          entityId: acidente.id,
          diff: {
            tipo: data.tipo,
            gravidade: data.gravidade,
            data: data.data,
            descricao: data.descricao,
          },
        },
      });
    } catch (_) {}

    return NextResponse.json({ success: true, data: acidente }, { status: 201 });
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
