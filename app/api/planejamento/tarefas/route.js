import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

const SETORES = [
  "PRODUCAO", "PINTURA", "PCP", "EXPEDICAO", "COMERCIAL",
  "ENGENHARIA", "COMPRAS", "ALMOXARIFADO", "FINANCEIRO", "RH", "PLANEJAMENTO",
];
const STATUS = ["PENDENTE", "EM_ANDAMENTO", "CONCLUIDA", "CANCELADA"];
const PRIORIDADES = ["ALTA", "MEDIA", "BAIXA"];

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

  const tarefas = await prisma.tarefaPlanejamento.findMany({
    where,
    include: {
      op: { select: { numero: true, cliente: true } },
      createdBy: { select: { name: true } },
    },
    orderBy: [{ prioridade: "asc" }, { createdAt: "desc" }],
    take: 500,
  });

  return NextResponse.json({ tarefas });
}

const schemaCriar = z.object({
  titulo: z.string().min(1),
  descricao: z.string().nullable().optional(),
  opNumero: z.string().nullable().optional(),
  setor: z.enum(SETORES),
  semanaIso: z.number().int().min(1).max(53),
  ano: z.number().int().min(2024),
  prioridade: z.enum(PRIORIDADES).default("MEDIA"),
  responsavel: z.string().nullable().optional(),
  dataPrevista: z.string().nullable().optional(),
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
  if (body.opNumero) {
    const op = await prisma.oP.findUnique({ where: { numero: body.opNumero } });
    if (op) opId = op.id;
  }

  const tarefa = await prisma.tarefaPlanejamento.create({
    data: {
      titulo: body.titulo,
      descricao: body.descricao || null,
      opNumero: body.opNumero || null,
      opId,
      setor: body.setor,
      semanaIso: body.semanaIso,
      ano: body.ano,
      prioridade: body.prioridade,
      responsavel: body.responsavel || null,
      dataPrevista: body.dataPrevista ? new Date(body.dataPrevista) : null,
      observacao: body.observacao || null,
      createdById: user.id,
    },
  });

  return NextResponse.json({ tarefa }, { status: 201 });
}
