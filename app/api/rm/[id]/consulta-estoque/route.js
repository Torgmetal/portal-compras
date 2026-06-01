import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { criarNotificacao } from "@/lib/notificacoes";
import { sendEmail } from "@/lib/email";

const postSchema = z.object({
  mensagem: z.string().max(500).optional(),
  email: z.string().email("Email inválido").optional(),
});

// GET — busca consultas de estoque dessa RM
export async function GET(req, { params }) {
  try {
    await requireRole(["ADMIN", "COMPRAS", "PRODUCAO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  const consultas = await prisma.consultaEstoque.findMany({
    where: { rmId: params.id },
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { name: true } },
      itens: {
        include: {
          rmItem: { select: { id: true, descricao: true, unidade: true, qtd: true, peso: true } },
          respondidoPor: { select: { name: true } },
        },
      },
    },
  });

  return NextResponse.json({ success: true, consultas });
}

// POST — Compras envia consulta de estoque para Produção
export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMPRAS"]);
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

  const rm = await prisma.rM.findUnique({
    where: { id: params.id },
    include: {
      itens: {
        where: { canceladoEm: null },
        orderBy: { ordem: "asc" },
        select: { id: true, descricao: true, unidade: true, qtd: true, peso: true },
      },
      op: { select: { numero: true, cliente: true } },
    },
  });
  if (!rm) {
    return NextResponse.json({ success: false, error: "RM não encontrada" }, { status: 404 });
  }
  if (rm.itens.length === 0) {
    return NextResponse.json({ success: false, error: "RM sem itens ativos" }, { status: 400 });
  }

  // Verifica se já existe consulta ENVIADA pendente
  const pendente = await prisma.consultaEstoque.findFirst({
    where: { rmId: rm.id, status: "ENVIADA" },
  });
  if (pendente) {
    return NextResponse.json({ success: false, error: "Já existe uma consulta pendente para esta RM" }, { status: 409 });
  }

  // Cria a consulta com itens
  const consulta = await prisma.consultaEstoque.create({
    data: {
      rmId: rm.id,
      createdById: user.id,
      mensagem: body.mensagem || null,
      itens: {
        create: rm.itens.map((item) => ({
          rmItemId: item.id,
        })),
      },
    },
    include: {
      itens: {
        include: {
          rmItem: { select: { descricao: true, unidade: true, qtd: true, peso: true } },
        },
      },
    },
  });

  // Notificação in-app
  const opLabel = rm.op ? `OP ${rm.op.numero}` : "Sem OP";
  await criarNotificacao({
    tipo: "CONSULTA_ESTOQUE",
    titulo: `Consulta de estoque — RM ${rm.numero}`,
    mensagem: `${user.name} solicitou verificação de estoque para RM ${rm.numero} (${opLabel}). ${rm.itens.length} iten${rm.itens.length === 1 ? "" : "s"} para avaliar.`,
    link: `/producao/consulta-estoque/${consulta.id}`,
    origemUserId: user.id,
  });

  // Email: usa o email informado manualmente, ou busca usuários de Produção
  let emails = [];
  if (body.email) {
    emails = [body.email];
  } else {
    const producaoUsers = await prisma.user.findMany({
      where: {
        ativo: true,
        OR: [
          { tipo: "ADMIN" },
          { modulos: { some: { modulo: "PRODUCAO" } } },
        ],
      },
      select: { email: true },
    });
    emails = producaoUsers.map((u) => u.email).filter(Boolean);
  }

  if (emails.length > 0) {
    const itensHtml = rm.itens.map((it) => {
      const qtdLabel = (it.peso || 0) > 0 ? `${it.peso} KG` : `${it.qtd} ${it.unidade}`;
      return `<li>${it.descricao} — ${qtdLabel}</li>`;
    }).join("");

    await sendEmail({
      to: emails,
      subject: `Consulta de estoque — RM ${rm.numero} (${opLabel})`,
      html: `
        <h2>Consulta de Estoque</h2>
        <p><strong>${user.name}</strong> solicitou verificação de disponibilidade para a <strong>RM ${rm.numero}</strong> (${opLabel}).</p>
        ${body.mensagem ? `<p><em>"${body.mensagem}"</em></p>` : ""}
        <p><strong>Itens para avaliar:</strong></p>
        <ul>${itensHtml}</ul>
        <p><a href="${process.env.NEXTAUTH_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"}/producao/consulta-estoque/${consulta.id}">Responder no sistema</a></p>
      `,
    });
  }

  // Audit log
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "CONSULTA_ESTOQUE_CRIADA",
      entity: "ConsultaEstoque",
      entityId: consulta.id,
      details: {
        rmId: rm.id,
        rmNumero: rm.numero,
        qtdItens: rm.itens.length,
        mensagem: body.mensagem || null,
      },
    },
  });

  return NextResponse.json({ success: true, consulta }, { status: 201 });
}
