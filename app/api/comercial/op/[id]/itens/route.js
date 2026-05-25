import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

// POST — ADMIN adiciona N itens novos a uma OP ja existente
// (sem precisar criar aditivo). Util pra completar OPs que esqueceram
// algum item na criacao.

const itemSchema = z.object({
  categoria: z.string().min(1),
  tipo: z.enum(["VERBA", "ESTRUTURA", "AREA", "ALUGUEL", "GENERICO"]),
  descricao: z.string().min(1),
  codigoOmie: z.string().optional().nullable(),
  localEstoque: z.string().optional().nullable(),
  unidade: z.string().optional().nullable(),
  qtdContratada: z.number().optional().nullable(),
  cmcMedio: z.number().optional().nullable(),
  meses: z.number().optional().nullable(),
  valorPorMes: z.number().optional().nullable(),
  capacidade: z.string().optional().nullable(),
  valorVerba: z.number().min(0),
  faturamentoDireto: z.boolean().default(false),
  observacao: z.string().optional().nullable(),
});

const schema = z.object({
  itens: z.array(itemSchema).min(1),
});

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMERCIAL"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao." }, { status: 403 });
  }
  if (user.modulos?.includes("COMERCIAL") && !user.podeAlterarVerba) {
    return NextResponse.json(
      { error: "Voce nao tem permissao pra adicionar itens diretamente. Solicite via aditivo." },
      { status: 403 }
    );
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados invalidos: " + (e.message || "") }, { status: 400 });
  }

  const op = await prisma.oP.findUnique({
    where: { id: params.id },
    include: { itens: { select: { ordem: true } } },
  });
  if (!op) return NextResponse.json({ error: "OP nao encontrada." }, { status: 404 });

  // Calcula proxima ordem (apos os itens ja existentes)
  const maxOrdem = op.itens.reduce((m, it) => Math.max(m, it.ordem), -1);

  const created = await prisma.oPItem.createMany({
    data: body.itens.map((it, idx) => ({
      opId: op.id,
      ordem: maxOrdem + 1 + idx,
      categoria: it.categoria,
      tipo: it.tipo,
      descricao: it.descricao,
      codigoOmie: it.codigoOmie || null,
      localEstoque: it.localEstoque || null,
      unidade: it.unidade || null,
      qtdContratada: it.qtdContratada ?? null,
      cmcMedio: it.cmcMedio ?? null,
      meses: it.meses ?? null,
      valorPorMes: it.valorPorMes ?? null,
      capacidade: it.capacidade || null,
      valorVerba: it.valorVerba,
      faturamentoDireto: it.faturamentoDireto,
      observacao: it.observacao || null,
    })),
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "add_op_itens",
      entity: "OP",
      entityId: op.id,
      diff: {
        opNumero: op.numero,
        qtdItensAdicionados: created.count,
        valorTotal: body.itens.reduce((s, it) => s + (it.valorVerba || 0), 0),
      },
    },
  });

  return NextResponse.json({ ok: true, count: created.count });
}
