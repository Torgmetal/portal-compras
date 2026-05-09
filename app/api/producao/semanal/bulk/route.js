import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { isoWeekString, parseSemana, semanaInicio, semanaFim } from "@/lib/semana";

const itemSchema = z.object({
  data: z.string(),
  pesoPrevistoKg: z.number().min(0).default(0),
  pesoRealizadoKg: z.number().min(0).default(0),
  valorPrevisto: z.number().min(0).default(0),
  valorRealizado: z.number().min(0).default(0),
  opId: z.string().nullable().optional(),
  observacao: z.string().nullable().optional(),
});

const schema = z.object({
  itens: z.array(itemSchema).min(1),
});

// POST — cria/atualiza N lancamentos DIARIOS em batch (upsert por (data, opId))
export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "PRODUCAO", "COMERCIAL", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados invalidos: " + (e.message || "") }, { status: 400 });
  }

  let criados = 0, atualizados = 0;
  for (const it of body.itens) {
    const dataDia = new Date(it.data);
    if (isNaN(dataDia)) continue;
    const semana = isoWeekString(dataDia);
    const p = parseSemana(semana);
    const dataInicio = p ? semanaInicio(p.ano, p.semana) : dataDia;
    const dataFim = p ? semanaFim(p.ano, p.semana) : dataDia;

    const where = { data_opId: { data: dataDia, opId: it.opId || null } };
    const dataPayload = {
      data: dataDia,
      semana,
      dataInicio,
      dataFim,
      pesoPrevistoKg: it.pesoPrevistoKg,
      pesoRealizadoKg: it.pesoRealizadoKg,
      valorPrevisto: it.valorPrevisto,
      valorRealizado: it.valorRealizado,
      opId: it.opId || null,
      observacao: it.observacao || null,
      createdById: user.id,
    };

    const existente = await prisma.producaoSemanal.findUnique({ where });
    if (existente) {
      await prisma.producaoSemanal.update({
        where,
        data: {
          pesoPrevistoKg: it.pesoPrevistoKg,
          pesoRealizadoKg: it.pesoRealizadoKg,
          valorPrevisto: it.valorPrevisto,
          valorRealizado: it.valorRealizado,
          observacao: it.observacao || null,
        },
      });
      atualizados++;
    } else {
      await prisma.producaoSemanal.create({ data: dataPayload });
      criados++;
    }
  }

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "import_producao_pcp",
      entity: "ProducaoSemanal",
      entityId: "bulk",
      diff: { criados, atualizados, total: body.itens.length },
    },
  });

  return NextResponse.json({ ok: true, criados, atualizados });
}
