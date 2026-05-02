import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

const itemSchema = z.object({
  opItemId: z.string().nullable().optional(),
  aditivoItemId: z.string().nullable().optional(),
  descricao: z.string().min(1),
  unidade: z.string().min(1),
  qtd: z.number().min(0),
  // Campos detalhados (de planilha Tekla)
  codigo: z.string().optional().nullable(),
  material: z.string().optional().nullable(),
  comprimento: z.string().optional().nullable(),
  largura: z.string().optional().nullable(),
  tratamento: z.string().optional().nullable(),
  peso: z.number().optional().nullable(),
  pesoLinear: z.number().optional().nullable(),
});

const schema = z.object({
  tipoRM: z.enum(["ENGENHARIA", "INTERNA"]).default("ENGENHARIA"),
  opId: z.string().nullable().optional(),
  categoriasOP: z.array(z.string()).default([]),
  tipo: z.string().default("Material"),
  descricao: z.string().min(1),
  observacao: z.string().optional().nullable(),
  setor: z.string().optional().nullable(),
  itens: z.array(itemSchema).min(1),
});

export async function POST(req) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados inválidos: " + (e.message || "") }, { status: 400 });
  }

  // Próximo número de RM (RM-0001, RM-0002, etc) — global
  const ultima = await prisma.rM.findFirst({ orderBy: { createdAt: "desc" }, select: { numero: true } });
  let proximoNumero = "0001";
  if (ultima?.numero) {
    const m = ultima.numero.match(/^(?:RM-)?(\d+)$/);
    if (m) proximoNumero = String(parseInt(m[1]) + 1).padStart(4, "0");
  }
  const numeroRM = `RM-${proximoNumero}`;

  const rm = await prisma.rM.create({
    data: {
      numero: numeroRM,
      tipoRM: body.tipoRM,
      opId: body.opId || null,
      categoriasOP: body.categoriasOP,
      tipo: body.tipo,
      descricao: body.descricao,
      observacao: body.observacao || null,
      createdById: user.id,
      setor: body.setor || user.setor || null,
      itens: {
        create: body.itens.map((it, idx) => ({
          ordem: idx,
          opItemId: it.opItemId || null,
          aditivoItemId: it.aditivoItemId || null,
          descricao: it.descricao,
          unidade: it.unidade,
          qtd: it.qtd,
          codigo: it.codigo || null,
          material: it.material || null,
          comprimento: it.comprimento || null,
          largura: it.largura || null,
          tratamento: it.tratamento || null,
          peso: it.peso ?? null,
          pesoLinear: it.pesoLinear ?? null,
        })),
      },
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "create_rm",
      entity: "RM",
      entityId: rm.id,
      diff: {
        numero: rm.numero,
        tipoRM: body.tipoRM,
        opId: body.opId || null,
        categoriasOP: body.categoriasOP,
        itens: body.itens.length,
      },
    },
  });

  return NextResponse.json({ id: rm.id, numero: rm.numero });
}
