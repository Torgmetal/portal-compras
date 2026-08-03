import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const schema = z.object({
  categoria: z.string().min(1).optional(),
  descricao: z.string().min(1).optional(),
  tipoPreco: z.enum(["VALOR", "POR_UNIDADE", "POR_KG", "POR_PECA"]).optional(),
  unidade: z.string().max(20).optional().nullable(),
  quantidade: z.number().min(0).optional().nullable(),
  valorUnitario: z.number().min(0).optional().nullable(),
  valor: z.number().min(0).optional(),
  cfop: z.string().optional().nullable(),
  codigoServico: z.string().optional().nullable(),
  icmsPct: z.number().min(0).max(100).optional().nullable(),
  ipiPct: z.number().min(0).max(100).optional().nullable(),
  pisPct: z.number().min(0).max(100).optional().nullable(),
  cofinsPct: z.number().min(0).max(100).optional().nullable(),
  issPct: z.number().min(0).max(100).optional().nullable(),
  irrfPct: z.number().min(0).max(100).optional().nullable(),
  csllPct: z.number().min(0).max(100).optional().nullable(),
  observacao: z.string().optional().nullable(),
  enderecoFaturamento: z.string().optional().nullable(),
});

// PATCH — edita uma receita existente
export async function PATCH(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMERCIAL"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao." }, { status: 403 });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados invalidos" }, { status: 400 });
  }

  const receita = await prisma.oPReceita.findUnique({ where: { id: params.id } });
  if (!receita) return NextResponse.json({ error: "Receita nao encontrada." }, { status: 404 });

  // Recalcula o valor da linha quando é kg × R$/kg ou peças × valor unit.
  const data = { ...body };
  if (body.tipoPreco !== undefined) {
    const tipo = body.tipoPreco || "VALOR";
    data.tipoPreco = tipo;
    data.unidade = tipo === "VALOR" ? null : (body.unidade?.trim() || null);
    data.quantidade = tipo === "VALOR" ? null : (body.quantidade ?? null);
    data.valorUnitario = tipo === "VALOR" ? null : (body.valorUnitario ?? null);
    if (tipo !== "VALOR" && data.quantidade != null && data.valorUnitario != null) {
      data.valor = data.quantidade * data.valorUnitario;
    }
  }

  const updated = await prisma.oPReceita.update({ where: { id: params.id }, data });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "edit_op_receita",
      entity: "OPReceita",
      entityId: receita.id,
      diff: {
        opId: receita.opId,
        antes: { valor: receita.valor, categoria: receita.categoria },
        depois: { valor: updated.valor, categoria: updated.categoria },
      },
    },
  });

  return NextResponse.json({ ok: true });
}

// DELETE — apaga receita
export async function DELETE(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMERCIAL"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao." }, { status: 403 });
  }

  const receita = await prisma.oPReceita.findUnique({ where: { id: params.id } });
  if (!receita) return NextResponse.json({ error: "Receita nao encontrada." }, { status: 404 });

  await prisma.oPReceita.delete({ where: { id: params.id } });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "delete_op_receita",
      entity: "OPReceita",
      entityId: receita.id,
      diff: {
        opId: receita.opId,
        categoria: receita.categoria,
        valor: receita.valor,
      },
    },
  });

  return NextResponse.json({ ok: true });
}
