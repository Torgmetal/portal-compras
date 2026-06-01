import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

export async function GET(req) {
  try {
    await requireRole(["ADMIN", "PLANEJAMENTO", "PRODUCAO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: e.message }, { status });
  }

  const { searchParams } = new URL(req.url, "http://n");
  const semana = parseInt(searchParams.get("semana")) || null;
  const ano = parseInt(searchParams.get("ano")) || null;
  const setor = searchParams.get("setor");

  const where = {};
  if (semana && ano) { where.semanaIso = semana; where.ano = ano; }
  if (setor) where.setor = setor;

  const itens = await prisma.necessidadeSemanal.findMany({
    where,
    include: {
      op: { select: { numero: true, cliente: true, dataFimPrevista: true } },
      createdBy: { select: { name: true } },
    },
    orderBy: [{ prioridade: "asc" }, { opNumero: "asc" }],
    take: 500,
  });

  return NextResponse.json({ itens });
}

const schemaCriar = z.object({
  opNumero: z.string().min(1),
  setor: z.enum(["PRODUCAO", "PINTURA", "EXPEDICAO"]),
  semanaIso: z.number().int().min(1).max(53),
  ano: z.number().int().min(2024),
  descricao: z.string().nullable().optional(),
  pesoKg: z.number().min(0).default(0),
  prioridade: z.enum(["ALTA", "MEDIA", "BAIXA"]).default("MEDIA"),
  observacao: z.string().nullable().optional(),
});

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "PLANEJAMENTO", "PRODUCAO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: e.message }, { status });
  }

  let body;
  try {
    body = schemaCriar.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados inválidos: " + (e.issues?.[0]?.message || e.message) }, { status: 400 });
  }

  let opId = null;
  const op = await prisma.oP.findUnique({ where: { numero: body.opNumero } });
  if (op) opId = op.id;

  const item = await prisma.necessidadeSemanal.create({
    data: {
      opNumero: body.opNumero,
      opId,
      setor: body.setor,
      semanaIso: body.semanaIso,
      ano: body.ano,
      descricao: body.descricao || null,
      pesoKg: body.pesoKg,
      prioridade: body.prioridade,
      observacao: body.observacao || null,
      createdById: user.id,
    },
  });

  return NextResponse.json({ item }, { status: 201 });
}
