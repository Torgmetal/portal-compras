// POST /api/rm/[id]/itens — adiciona um item NOVO a uma RM (item esquecido).
// Cria o RMItem e, pras cotações AINDA ABERTAS que envolvem essa RM, cria o
// CotacaoItem (preço 0) pra o fornecedor cotar. Cotação finalizada
// (PEDIDO_GERADO) ou cancelada/declinada fica de fora.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const schema = z.object({
  descricao: z.string().min(1),
  unidade: z.string().min(1),
  qtd: z.number().positive(),
  codigoOmie: z.string().nullable().optional(),
  material: z.string().nullable().optional(),
  comprimento: z.string().nullable().optional(),
  largura: z.string().nullable().optional(),
  peso: z.number().nullable().optional(),
  observacao: z.string().nullable().optional(),
});

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Apenas Admin ou Compras pode adicionar itens." }, { status: 403 });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados inválidos: " + e.message }, { status: 400 });
  }

  const rm = await prisma.rM.findUnique({
    where: { id: params.id },
    select: { id: true, numero: true, tipoRM: true, itens: { select: { ordem: true } } },
  });
  if (!rm) return NextResponse.json({ error: "RM não encontrada." }, { status: 404 });
  if (["ALUGUEL", "MONTAGEM"].includes(rm.tipoRM)) {
    return NextResponse.json({ error: "RM de aluguel/montagem não passa por cotação." }, { status: 400 });
  }

  const proximaOrdem = rm.itens.reduce((m, it) => Math.max(m, it.ordem ?? 0), -1) + 1;

  const novo = await prisma.rMItem.create({
    data: {
      rmId: rm.id,
      ordem: proximaOrdem,
      descricao: body.descricao.trim(),
      unidade: body.unidade.trim(),
      qtd: body.qtd,
      // Código Omie: o pedido usa codigoOmieEstoque; seto os dois (igual à
      // criação normal da RM) pra o pedido reconhecer o produto.
      codigo: body.codigoOmie?.trim() || null,
      codigoOmieEstoque: body.codigoOmie?.trim() || null,
      material: body.material?.trim() || null,
      comprimento: body.comprimento?.trim() || null,
      largura: body.largura?.trim() || null,
      peso: body.peso ?? null,
      observacao: body.observacao?.trim() || null,
      status: "PENDENTE",
    },
  });

  // Propaga pras cotações ABERTAS que envolvem essa RM (rmId direto OU itens de
  // outras RMs consolidadas). Abertas = PENDENTE (esperando resposta) ou RECEBIDA
  // (respondeu, mas pode recotar). Fora: VENCIDA/CANCELADA/DECLINADA.
  const cotacoes = await prisma.cotacao.findMany({
    where: {
      status: { in: ["PENDENTE", "RECEBIDA"] },
      OR: [{ rmId: rm.id }, { itens: { some: { rmItem: { rmId: rm.id } } } }],
    },
    select: { id: true },
  });
  if (cotacoes.length > 0) {
    await prisma.cotacaoItem.createMany({
      data: cotacoes.map((c) => ({ cotacaoId: c.id, rmItemId: novo.id, precoUnit: 0, qtdCotada: body.qtd })),
      skipDuplicates: true,
    });
  }

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "add_rm_item",
      entity: "RMItem",
      entityId: novo.id,
      diff: { rmId: rm.id, rmNumero: rm.numero, descricao: novo.descricao, cotacoesAtualizadas: cotacoes.length },
    },
  });

  return NextResponse.json({ ok: true, item: novo, cotacoesAtualizadas: cotacoes.length });
}
