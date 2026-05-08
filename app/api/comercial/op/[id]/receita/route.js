import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

// POST — cria nova receita vinculada a uma OP
const schema = z.object({
  categoria: z.string().min(1),
  descricao: z.string().min(1),
  valor: z.number().min(0),
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
});

export async function POST(req, { params }) {
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
    return NextResponse.json({ error: "Dados invalidos: " + (e.message || "") }, { status: 400 });
  }

  const op = await prisma.oP.findUnique({
    where: { id: params.id },
    include: { receitas: { select: { ordem: true } } },
  });
  if (!op) return NextResponse.json({ error: "OP nao encontrada." }, { status: 404 });

  const maxOrdem = op.receitas.reduce((m, r) => Math.max(m, r.ordem), -1);

  const created = await prisma.oPReceita.create({
    data: {
      opId: op.id,
      ordem: maxOrdem + 1,
      categoria: body.categoria,
      descricao: body.descricao,
      valor: body.valor,
      cfop: body.cfop || null,
      codigoServico: body.codigoServico || null,
      icmsPct: body.icmsPct ?? null,
      ipiPct: body.ipiPct ?? null,
      pisPct: body.pisPct ?? null,
      cofinsPct: body.cofinsPct ?? null,
      issPct: body.issPct ?? null,
      irrfPct: body.irrfPct ?? null,
      csllPct: body.csllPct ?? null,
      observacao: body.observacao || null,
      createdById: user.id,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "create_op_receita",
      entity: "OPReceita",
      entityId: created.id,
      diff: {
        opNumero: op.numero,
        categoria: body.categoria,
        valor: body.valor,
      },
    },
  });

  return NextResponse.json({ id: created.id });
}
