import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { criarNotificacao } from "@/lib/notificacoes";
import { sendEmail } from "@/lib/email";

const postSchema = z.object({
  mensagem: z.string().max(500).optional(),
  email: z.string().trim().email().optional(),
});

const patchSchema = z.object({
  consultaId: z.string(),
  acao: z.enum(["CANCELAR"]),
});

// GET — busca consultas de estoque dessa RM
export async function GET(req, { params }) {
  try {
    await requireRole(["ADMIN", "COMPRAS", "PRODUCAO"]);
    const { id } = await params;

    const consultas = await prisma.consultaEstoque.findMany({
      where: { rmId: id },
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
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}

// POST — Compras envia consulta de estoque para Produção
export async function POST(req, { params }) {
  try {
    const user = await requireRole(["ADMIN", "COMPRAS"]);
    const { id } = await params;

    // Pre-processar body — limpar strings vazias antes do Zod
    const raw = await req.json();
    if (typeof raw.email === "string") {
      raw.email = raw.email.trim() || undefined;
    }
    if (typeof raw.mensagem === "string") {
      raw.mensagem = raw.mensagem.trim() || undefined;
    }

    let body;
    try {
      body = postSchema.parse(raw);
    } catch (e) {
      const msg = e.issues?.[0]?.message || "Dados inválidos";
      return NextResponse.json({ success: false, error: msg.includes("email") || msg.includes("pattern") ? "Email inválido" : msg }, { status: 400 });
    }

    const rm = await prisma.rM.findUnique({
      where: { id },
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
      // Produção responde as consultas; Engenharia também pode responder.
      const destinatarios = await prisma.user.findMany({
        where: {
          ativo: true,
          OR: [
            { tipo: "ADMIN" },
            { modulos: { some: { modulo: { in: ["PRODUCAO", "ENGENHARIA"] } } } },
          ],
        },
        select: { email: true },
      });
      emails = destinatarios.map((u) => u.email).filter(Boolean);
    }

  if (emails.length > 0) {
    const baseUrl = process.env.NEXTAUTH_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
    const linkResponder = `${baseUrl}/producao/consulta-estoque/${consulta.id}`;
    const clienteLabel = rm.op?.cliente ? ` — ${rm.op.cliente}` : "";

    const itensRows = rm.itens.map((it, i) => {
      const qtdLabel = (it.peso || 0) > 0 ? `${Number(it.peso).toLocaleString("pt-BR")} KG` : `${Number(it.qtd).toLocaleString("pt-BR")} ${it.unidade}`;
      const bg = i % 2 === 0 ? "#ffffff" : "#f7fafc";
      return `<tr style="background:${bg};">
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#2d3748;font-size:13px;">${it.descricao}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#4a5568;font-size:13px;text-align:right;white-space:nowrap;">${qtdLabel}</td>
      </tr>`;
    }).join("");

    await sendEmail({
      to: emails,
      subject: `Consulta de Estoque — RM ${rm.numero} (${opLabel})`,
      html: `
        <div style="font-family:-apple-system,system-ui,sans-serif;max-width:640px;margin:0 auto;color:#2d3748;">
          <h2 style="color:#006EAB;margin-top:0;">Consulta de Estoque</h2>

          <p style="color:#4a5568;line-height:1.6;">
            <strong>${user.name}</strong> (Compras) solicitou uma verificacao de disponibilidade em estoque
            para a <strong>RM ${rm.numero}</strong> (${opLabel}${clienteLabel}).
          </p>

          ${body.mensagem ? `
          <div style="background:#f7fafc;border-left:4px solid #006EAB;padding:12px 16px;border-radius:0 6px 6px 0;margin:16px 0;">
            <p style="color:#718096;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 4px 0;">Mensagem</p>
            <p style="color:#2d3748;font-size:14px;line-height:1.5;margin:0;">${body.mensagem}</p>
          </div>` : ""}

          <table style="width:100%;border-collapse:collapse;margin:24px 0;font-size:14px;">
            <tr><td style="padding:6px 0;color:#718096;width:160px;">Requisicao</td><td style="padding:6px 0;"><strong>RM ${rm.numero}</strong></td></tr>
            <tr><td style="padding:6px 0;color:#718096;">Referencia</td><td style="padding:6px 0;">${opLabel}${clienteLabel}</td></tr>
            <tr><td style="padding:6px 0;color:#718096;">Total de itens</td><td style="padding:6px 0;"><strong>${rm.itens.length}</strong></td></tr>
            <tr><td style="padding:6px 0;color:#718096;">Solicitado por</td><td style="padding:6px 0;">${user.name}</td></tr>
          </table>

          <p style="color:#2d3748;font-weight:700;font-size:14px;margin-bottom:8px;">Itens para avaliar:</p>
          <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
            <tr style="background:#002945;">
              <th style="padding:10px 12px;text-align:left;color:#ffffff;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Descricao</th>
              <th style="padding:10px 12px;text-align:right;color:#ffffff;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Quantidade</th>
            </tr>
            ${itensRows}
          </table>

          <div style="text-align:center;margin:32px 0;">
            <a href="${linkResponder}"
               style="display:inline-block;background:#006EAB;color:#ffffff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;">
              Responder consulta
            </a>
          </div>

          <p style="color:#718096;font-size:12px;line-height:1.5;">
            Ou copie e cole esse endereco no navegador:<br>
            <a href="${linkResponder}" style="color:#006EAB;word-break:break-all;">${linkResponder}</a>
          </p>

          <hr style="border:0;border-top:1px solid #e2e8f0;margin:24px 0;">
          <p style="color:#a0aec0;font-size:12px;line-height:1.4;">
            Atenciosamente,<br>
            <strong>Equipe de Compras — Torg Metal</strong>
          </p>
        </div>
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
  } catch (e) {
    if (e.issues) {
      return NextResponse.json({ success: false, error: e.issues[0]?.message || "Dados inválidos" }, { status: 400 });
    }
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}

// PATCH — cancelar consulta pendente
export async function PATCH(req, { params }) {
  try {
    const user = await requireRole(["ADMIN", "COMPRAS"]);
    const { id } = await params;

    let body;
    try {
      body = patchSchema.parse(await req.json());
    } catch (e) {
      return NextResponse.json({ success: false, error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 });
    }

    const consulta = await prisma.consultaEstoque.findUnique({
      where: { id: body.consultaId },
      select: { id: true, rmId: true, status: true },
    });
    if (!consulta || consulta.rmId !== id) {
      return NextResponse.json({ success: false, error: "Consulta não encontrada" }, { status: 404 });
    }
    if (consulta.status === "CANCELADA") {
      return NextResponse.json({ success: false, error: "Consulta ja esta cancelada" }, { status: 400 });
    }

    await prisma.consultaEstoque.update({
      where: { id: body.consultaId },
      data: { status: "CANCELADA" },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "CONSULTA_ESTOQUE_CANCELADA",
        entity: "ConsultaEstoque",
        entityId: body.consultaId,
        details: { rmId: id },
      },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    if (e.issues) {
      return NextResponse.json({ success: false, error: e.issues[0]?.message || "Dados inválidos" }, { status: 400 });
    }
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
