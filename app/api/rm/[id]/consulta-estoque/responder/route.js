import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { criarNotificacao } from "@/lib/notificacoes";
import { sendEmail } from "@/lib/email";

const respostaItemSchema = z.object({
  consultaItemId: z.string(),
  resposta: z.enum(["DISPONIVEL", "PARCIAL", "INDISPONIVEL"]),
  qtdDisponivel: z.number().min(0).nullable().optional(),
  observacao: z.string().max(500).optional(),
});

const postSchema = z.object({
  consultaId: z.string(),
  itens: z.array(respostaItemSchema).min(1),
});

// POST — Produção responde à consulta item a item
export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "PRODUCAO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  let body;
  try {
    body = postSchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ success: false, error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 });
  }

  // Verifica consulta
  const consulta = await prisma.consultaEstoque.findUnique({
    where: { id: body.consultaId },
    include: {
      rm: { select: { id: true, numero: true, opId: true, op: { select: { numero: true } } } },
      createdBy: { select: { id: true, name: true, email: true } },
      itens: { select: { id: true, rmItemId: true } },
    },
  });
  if (!consulta) {
    return NextResponse.json({ success: false, error: "Consulta não encontrada" }, { status: 404 });
  }
  if (consulta.rmId !== params.id) {
    return NextResponse.json({ success: false, error: "Consulta não pertence a esta RM" }, { status: 400 });
  }
  if (consulta.status !== "ENVIADA") {
    return NextResponse.json({ success: false, error: "Esta consulta já foi respondida" }, { status: 409 });
  }

  // Valida que todos os itens enviados pertencem à consulta
  const consultaItemIds = new Set(consulta.itens.map((i) => i.id));
  for (const item of body.itens) {
    if (!consultaItemIds.has(item.consultaItemId)) {
      return NextResponse.json({ success: false, error: `Item ${item.consultaItemId} não pertence a esta consulta` }, { status: 400 });
    }
  }

  // Atualiza itens e status da consulta em transação
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    for (const item of body.itens) {
      await tx.consultaEstoqueItem.update({
        where: { id: item.consultaItemId },
        data: {
          resposta: item.resposta,
          qtdDisponivel: item.qtdDisponivel ?? null,
          observacao: item.observacao || null,
          respondidoPorId: user.id,
          respondidoEm: now,
        },
      });
    }

    await tx.consultaEstoque.update({
      where: { id: body.consultaId },
      data: { status: "RESPONDIDA", respondidoEm: now },
    });
  });

  // Notificação para quem criou a consulta
  const opLabel = consulta.rm.op ? `OP ${consulta.rm.op.numero}` : "Sem OP";
  const resumo = body.itens.reduce((acc, it) => {
    acc[it.resposta] = (acc[it.resposta] || 0) + 1;
    return acc;
  }, {});
  const resumoText = [
    resumo.DISPONIVEL && `${resumo.DISPONIVEL} disponível`,
    resumo.PARCIAL && `${resumo.PARCIAL} parcial`,
    resumo.INDISPONIVEL && `${resumo.INDISPONIVEL} indisponível`,
  ].filter(Boolean).join(", ");

  await criarNotificacao({
    tipo: "CONSULTA_ESTOQUE",
    titulo: `Estoque respondido — RM ${consulta.rm.numero}`,
    mensagem: `${user.name} respondeu à consulta de estoque da RM ${consulta.rm.numero}: ${resumoText}.`,
    link: `/compras/rm/${consulta.rm.id}`,
    origemUserId: user.id,
  });

  // Email para quem criou
  if (consulta.createdBy.email) {
    await sendEmail({
      to: consulta.createdBy.email,
      subject: `Estoque respondido — RM ${consulta.rm.numero} (${opLabel})`,
      html: `
        <h2>Resposta da Consulta de Estoque</h2>
        <p><strong>${user.name}</strong> respondeu à sua consulta de estoque para a <strong>RM ${consulta.rm.numero}</strong> (${opLabel}).</p>
        <p><strong>Resumo:</strong> ${resumoText}</p>
        <p><a href="${process.env.NEXTAUTH_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"}/compras/rm/${consulta.rm.id}">Ver detalhes no sistema</a></p>
      `,
    });
  }

  // Audit log
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "CONSULTA_ESTOQUE_RESPONDIDA",
      entity: "ConsultaEstoque",
      entityId: body.consultaId,
      details: {
        rmId: consulta.rm.id,
        rmNumero: consulta.rm.numero,
        respostas: body.itens.map((it) => ({ id: it.consultaItemId, resposta: it.resposta })),
      },
    },
  });

  return NextResponse.json({ success: true });
}
