import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const itemSchema = z.object({
  categoria: z.string().min(1),
  tipo: z.enum(["VERBA", "ESTRUTURA", "AREA", "ALUGUEL", "GENERICO"]),
  descricao: z.string().min(1),
  codigoOmie: z.string().optional().nullable(),
  unidade: z.string().optional().nullable(),
  qtdContratada: z.number().optional().nullable(),
  meses: z.number().optional().nullable(),
  valorPorMes: z.number().optional().nullable(),
  capacidade: z.string().optional().nullable(),
  valorVerba: z.number().min(0),
  faturamentoDireto: z.boolean().default(false),
  observacao: z.string().optional().nullable(),
});

const schema = z.object({
  descricao: z.string().min(1),
  itens: z.array(itemSchema).min(1),
});

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMERCIAL"]);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = schema.parse(await req.json());

  const ultimo = await prisma.aditivo.findFirst({
    where: { opId: params.id },
    orderBy: { numero: "desc" },
  });
  const numero = (ultimo?.numero || 0) + 1;

  const ad = await prisma.aditivo.create({
    data: {
      opId: params.id,
      numero,
      descricao: body.descricao,
      createdById: user.id,
      itens: {
        create: body.itens.map((it, idx) => ({
          ordem: idx,
          categoria: it.categoria,
          tipo: it.tipo,
          descricao: it.descricao,
          codigoOmie: it.codigoOmie || null,
          unidade: it.unidade || null,
          qtdContratada: it.qtdContratada ?? null,
          meses: it.meses ?? null,
          valorPorMes: it.valorPorMes ?? null,
          capacidade: it.capacidade || null,
          valorVerba: it.valorVerba,
          faturamentoDireto: it.faturamentoDireto,
          observacao: it.observacao || null,
        })),
      },
    },
  });

  await prisma.auditLog.create({
    data: { userId: user.id, action: "create_aditivo", entity: "Aditivo", entityId: ad.id, diff: { numero, itens: body.itens.length } },
  });

  return NextResponse.json({ id: ad.id, numero });
}
