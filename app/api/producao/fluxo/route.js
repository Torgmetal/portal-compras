import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const schema = z.object({
  data: z.string(),
  tipo: z.enum(["ENTRADA", "SAIDA"]),
  categoria: z.string().min(1),
  descricao: z.string().min(1),
  valor: z.number().min(0),
  realizado: z.boolean().default(false),
  dataRealizado: z.string().nullable().optional(),
  opId: z.string().nullable().optional(),
  observacao: z.string().nullable().optional(),
});

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMERCIAL", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados invalidos" }, { status: 400 });
  }

  const created = await prisma.fluxoCaixa.create({
    data: {
      data: new Date(body.data),
      tipo: body.tipo,
      categoria: body.categoria,
      descricao: body.descricao,
      valor: body.valor,
      realizado: body.realizado,
      dataRealizado: body.dataRealizado ? new Date(body.dataRealizado) : null,
      opId: body.opId || null,
      observacao: body.observacao || null,
      createdById: user.id,
    },
  });

  return NextResponse.json({ id: created.id });
}
