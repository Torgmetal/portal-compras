// GET /api/producao/controle?data=2026-05-22&setor=CORTE
// POST /api/producao/controle — cria/atualiza planejamento diário
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

export const runtime = "nodejs";

const SETORES = ["CORTE", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDICAO"];

const schemaCreate = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  setor: z.enum(SETORES),
  pesoMetaKg: z.number().min(0).optional(),
  pesoRealizadoKg: z.number().min(0).optional(),
  produtividadeEstimada: z.number().min(0).nullable().optional(),
  qtdPessoas: z.number().int().min(0).optional(),
  horasNormais: z.number().min(0).optional(),
  horasExtrasProjetadas: z.number().min(0).optional(),
  horasExtrasRealizadas: z.number().min(0).nullable().optional(),
  observacao: z.string().nullable().optional(),
});

export async function GET(req) {
  try {
    await requireRole(["ADMIN", "PRODUCAO", "COMERCIAL"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const dataStr = searchParams.get("data");
  const setor = searchParams.get("setor");

  const where = {};
  if (dataStr) {
    where.data = new Date(dataStr + "T00:00:00Z");
  }
  if (setor && SETORES.includes(setor)) {
    where.setor = setor;
  }

  // Se pede um range (semana)
  const de = searchParams.get("de");
  const ate = searchParams.get("ate");
  if (de && ate) {
    where.data = {
      gte: new Date(de + "T00:00:00Z"),
      lte: new Date(ate + "T00:00:00Z"),
    };
  }

  const registros = await prisma.producaoDiaria.findMany({
    where,
    include: {
      pecasPlanejadas: {
        include: {
          pecaConjunto: {
            select: { id: true, marca: true, descricao: true, opNumero: true, qte: true, pesoUnitKg: true, pesoTotalKg: true, precoUnitario: true, precoTotal: true, status: true },
          },
        },
      },
      createdBy: { select: { name: true } },
    },
    orderBy: [{ data: "asc" }, { setor: "asc" }],
  });

  return NextResponse.json({ registros: JSON.parse(JSON.stringify(registros)) });
}

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao — apenas ADMIN" }, { status: 403 });
  }

  let body;
  try {
    body = schemaCreate.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados invalidos: " + e.message }, { status: 400 });
  }

  const dataDate = new Date(body.data + "T00:00:00Z");

  const registro = await prisma.producaoDiaria.upsert({
    where: { data_setor: { data: dataDate, setor: body.setor } },
    create: {
      data: dataDate,
      setor: body.setor,
      pesoMetaKg: body.pesoMetaKg ?? 0,
      pesoRealizadoKg: body.pesoRealizadoKg ?? 0,
      produtividadeEstimada: body.produtividadeEstimada ?? null,
      qtdPessoas: body.qtdPessoas ?? 0,
      horasNormais: body.horasNormais ?? 8.8,
      horasExtrasProjetadas: body.horasExtrasProjetadas ?? 0,
      horasExtrasRealizadas: body.horasExtrasRealizadas ?? null,
      observacao: body.observacao ?? null,
      createdById: user.id,
    },
    update: {
      ...(body.pesoMetaKg !== undefined && { pesoMetaKg: body.pesoMetaKg }),
      ...(body.pesoRealizadoKg !== undefined && { pesoRealizadoKg: body.pesoRealizadoKg }),
      ...(body.produtividadeEstimada !== undefined && { produtividadeEstimada: body.produtividadeEstimada }),
      ...(body.qtdPessoas !== undefined && { qtdPessoas: body.qtdPessoas }),
      ...(body.horasNormais !== undefined && { horasNormais: body.horasNormais }),
      ...(body.horasExtrasProjetadas !== undefined && { horasExtrasProjetadas: body.horasExtrasProjetadas }),
      ...(body.horasExtrasRealizadas !== undefined && { horasExtrasRealizadas: body.horasExtrasRealizadas }),
      ...(body.observacao !== undefined && { observacao: body.observacao }),
    },
  });

  return NextResponse.json({ ok: true, registro });
}
