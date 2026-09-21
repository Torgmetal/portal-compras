// Lançamentos de acompanhamento de um pedido — liberado para coleta, encaminhado para obra,
// material recebido (Matheus, 16/09/2026). POST cria, DELETE desfaz um lançamento errado.
//
// ⚠ Quem lança: COMPRAS, ALMOXARIFADO e ADMIN. Compras acompanha o pedido, mas quem vê o material
// chegar é o almoxarifado — deixá-lo de fora obrigaria a avisar alguém para registrar, que é como
// o registro para de acontecer.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { ETAPAS_VALIDAS, rotuloEtapa } from "@/lib/acompanhamento-pedido";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ROLES = ["ADMIN", "COMPRAS", "ALMOXARIFADO"];

const schema = z.object({
  etapa: z.enum(ETAPAS_VALIDAS),
  // ⚠ A data é digitada, não é `now()`: quem lança na segunda o que aconteceu na sexta precisa
  // registrar a sexta, senão o prazo medido vira o prazo da digitação.
  data: z.string().min(1),
  observacao: z.string().max(500).nullable().optional(),
});

const erroDeAcesso = (e) => NextResponse.json(
  { error: e.message === "Unauthorized" ? "Sessão expirada." : "Sem permissão." },
  { status: e.message === "Unauthorized" ? 401 : 403 },
);

export async function POST(req, { params }) {
  let user;
  try { user = await requireRole(ROLES); } catch (e) { return erroDeAcesso(e); }

  let body;
  try { body = schema.parse(await req.json()); } catch (e) {
    return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos." }, { status: 400 });
  }

  const data = new Date(body.data);
  if (Number.isNaN(data.getTime())) {
    return NextResponse.json({ error: "Data inválida." }, { status: 400 });
  }

  const pedido = await prisma.pedidoOmie.findUnique({ where: { id: params.id }, select: { id: true, numeroPedido: true } });
  if (!pedido) return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });

  const criado = await prisma.acompanhamentoPedido.create({
    data: {
      pedidoId: pedido.id,
      etapa: body.etapa,
      data,
      observacao: body.observacao?.trim() || null,
      registradoPorId: user.id,
    },
    select: { id: true, etapa: true, data: true, observacao: true, registradoPor: { select: { name: true } } },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "ACOMPANHAMENTO_PEDIDO_LANCADO",
      entity: "PedidoOmie",
      entityId: pedido.id,
      diff: { etapa: body.etapa, rotulo: rotuloEtapa(body.etapa), data: data.toISOString(), observacao: criado.observacao },
    },
  });

  return NextResponse.json({ success: true, lancamento: criado });
}

export async function DELETE(req, { params }) {
  let user;
  try { user = await requireRole(ROLES); } catch (e) { return erroDeAcesso(e); }

  const lancamentoId = new URL(req.url).searchParams.get("lancamentoId");
  if (!lancamentoId) return NextResponse.json({ error: "Lançamento não informado." }, { status: 400 });

  // ⚠ Confere que o lançamento é DESTE pedido: sem isso, o id de um lançamento de outro pedido
  // apagaria um registro que a tela de quem pediu nem mostra.
  const alvo = await prisma.acompanhamentoPedido.findUnique({
    where: { id: lancamentoId },
    select: { id: true, pedidoId: true, etapa: true, data: true, observacao: true },
  });
  if (!alvo || alvo.pedidoId !== params.id) {
    return NextResponse.json({ error: "Lançamento não encontrado neste pedido." }, { status: 404 });
  }

  await prisma.acompanhamentoPedido.delete({ where: { id: lancamentoId } });
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "ACOMPANHAMENTO_PEDIDO_DESFEITO",
      entity: "PedidoOmie",
      entityId: params.id,
      // ⚠ Guarda o que foi apagado: desfazer é a ação cujo rastro some junto com o dado.
      diff: { etapa: alvo.etapa, data: alvo.data, observacao: alvo.observacao },
    },
  });

  return NextResponse.json({ success: true });
}
