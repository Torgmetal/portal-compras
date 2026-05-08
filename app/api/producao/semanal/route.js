import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const schema = z.object({
  semana: z.string().regex(/^\d{4}-W\d{2}$/, "Formato esperado: 2026-W19"),
  dataInicio: z.string(), // ISO date
  dataFim: z.string(),
  pesoPrevistoKg: z.number().min(0).default(0),
  pesoRealizadoKg: z.number().min(0).default(0),
  valorPrevisto: z.number().min(0).default(0),
  valorRealizado: z.number().min(0).default(0),
  opId: z.string().nullable().optional(),
  observacao: z.string().nullable().optional(),
});

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMERCIAL", "COMPRAS", "PRODUCAO"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados invalidos: " + (e.message || "") }, { status: 400 });
  }

  // Upsert pra evitar duplicidade (semana + opId)
  const where = { semana_opId: { semana: body.semana, opId: body.opId || null } };
  const data = {
    semana: body.semana,
    dataInicio: new Date(body.dataInicio),
    dataFim: new Date(body.dataFim),
    pesoPrevistoKg: body.pesoPrevistoKg,
    pesoRealizadoKg: body.pesoRealizadoKg,
    valorPrevisto: body.valorPrevisto,
    valorRealizado: body.valorRealizado,
    opId: body.opId || null,
    observacao: body.observacao || null,
    createdById: user.id,
  };

  const created = await prisma.producaoSemanal.upsert({
    where,
    create: data,
    update: {
      pesoPrevistoKg: body.pesoPrevistoKg,
      pesoRealizadoKg: body.pesoRealizadoKg,
      valorPrevisto: body.valorPrevisto,
      valorRealizado: body.valorRealizado,
      observacao: body.observacao || null,
    },
  });

  return NextResponse.json({ id: created.id });
}
