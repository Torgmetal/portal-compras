import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { isoWeekString, parseSemana, semanaInicio, semanaFim } from "@/lib/semana";

// POST — cria/atualiza um lancamento DIARIO de producao.
// Mantém o nome /semanal pra retrocompatibilidade — agora cada linha = 1 dia.
const schema = z.object({
  data: z.string(),
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

  // Calcula semana ISO + dataInicio/Fim a partir da data
  const dataDia = new Date(body.data);
  if (isNaN(dataDia)) {
    return NextResponse.json({ error: "Data invalida" }, { status: 400 });
  }
  const semana = isoWeekString(dataDia);
  const p = parseSemana(semana);
  const dataInicio = p ? semanaInicio(p.ano, p.semana) : dataDia;
  const dataFim = p ? semanaFim(p.ano, p.semana) : dataDia;

  // Upsert por (data, opId)
  const where = { data_opId: { data: dataDia, opId: body.opId || null } };
  const dataPayload = {
    data: dataDia,
    semana,
    dataInicio,
    dataFim,
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
    create: dataPayload,
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
