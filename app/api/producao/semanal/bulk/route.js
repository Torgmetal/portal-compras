import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const itemSchema = z.object({
  semana: z.string().regex(/^\d{4}-W\d{2}$/),
  dataInicio: z.string(),
  dataFim: z.string(),
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

// POST — cria/atualiza N lancamentos de producao em batch
// (upsert por semana+opId pra evitar duplicidade)
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
    const where = { semana_opId: { semana: it.semana, opId: it.opId || null } };
    const data = {
      semana: it.semana,
      dataInicio: new Date(it.dataInicio),
      dataFim: new Date(it.dataFim),
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
      await prisma.producaoSemanal.create({ data });
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
