import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const itemSchema = z.object({
  descricao: z.string().min(1),
  codigoOmie: z.string().optional().nullable(),
  unidade: z.string().min(1),
  qtdContratada: z.number().min(0),
  valorVerba: z.number().min(0),
  faturamentoDireto: z.boolean().default(false),
  observacao: z.string().optional().nullable(),
});

const opSchema = z.object({
  numero: z.string().min(1).transform((s) => s.trim().toUpperCase()),
  cliente: z.string().min(1).transform((s) => s.trim()),
  obra: z.string().optional().nullable(),
  descricao: z.string().optional().nullable(),
  dataInicio: z.string().optional().nullable(),
  dataFimPrevista: z.string().optional().nullable(),
  itens: z.array(itemSchema).min(1),
});

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMERCIAL"]);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = opSchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados inválidos: " + (e.message || "") }, { status: 400 });
  }

  const existe = await prisma.oP.findUnique({ where: { numero: body.numero } });
  if (existe) {
    return NextResponse.json(
      { error: `Já existe uma OP com o número ${body.numero}.` },
      { status: 409 }
    );
  }

  const op = await prisma.oP.create({
    data: {
      numero: body.numero,
      cliente: body.cliente,
      obra: body.obra || null,
      descricao: body.descricao || null,
      dataInicio: body.dataInicio ? new Date(body.dataInicio) : null,
      dataFimPrevista: body.dataFimPrevista ? new Date(body.dataFimPrevista) : null,
      createdById: user.id,
      itens: {
        create: body.itens.map((it, idx) => ({
          ordem: idx,
          descricao: it.descricao,
          codigoOmie: it.codigoOmie || null,
          unidade: it.unidade,
          qtdContratada: it.qtdContratada,
          valorVerba: it.valorVerba,
          faturamentoDireto: it.faturamentoDireto,
          observacao: it.observacao || null,
        })),
      },
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "create_op",
      entity: "OP",
      entityId: op.id,
      diff: { numero: op.numero, cliente: op.cliente, itens: body.itens.length },
    },
  });

  return NextResponse.json({ id: op.id, numero: op.numero });
}
