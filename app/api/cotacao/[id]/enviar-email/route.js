// POST /api/cotacao/:id/enviar-email — envia email pro fornecedor com o link
// da cotacao via Resend. Link vai como <a href> HTML pra garantir que vira
// hiperlink clicavel em qualquer cliente (Outlook, Gmail, etc).
//
// Substitui o "mailto:" antigo que abria o cliente local com link em texto
// puro (alguns clientes nao convertiam automaticamente).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { sendEmail } from "@/lib/email";

export const runtime = "nodejs";

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao." }, { status: 403 });
  }

  const cot = await prisma.cotacao.findUnique({
    where: { id: params.id },
    include: {
      rm: { select: { id: true, numero: true, descricao: true } },
      itens: {
        include: {
          rmItem: { select: { rmId: true, descricao: true } },
        },
      },
    },
  });
  if (!cot) return NextResponse.json({ error: "Cotacao nao encontrada." }, { status: 404 });
  if (!cot.fornecedorEmail) {
    return NextResponse.json({ error: "Cotacao sem email do fornecedor." }, { status: 400 });
  }

  // Bloqueia cedo se Resend nao configurado — mensagem explicita pro usuario.
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json(
      {
        error: "Servico de email nao configurado. Peca pro admin setar RESEND_API_KEY no Vercel (Settings -> Environment Variables). Por enquanto, use o botao 'Copiar link' e envie manualmente.",
      },
      { status: 503 }
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://workspace-torg.vercel.app";
  const link = `${baseUrl}/fornecedores/c/${cot.token}`;

  // RMs envolvidas (pode ser multi-RM via CotacaoItem.rmItem.rmId)
  const rmIds = Array.from(new Set(cot.itens.map((i) => i.rmItem?.rmId).filter(Boolean)));
  let numerosRMs = [cot.rm?.numero].filter(Boolean);
  if (rmIds.length > 1) {
    const rms = await prisma.rM.findMany({
      where: { id: { in: rmIds } },
      select: { numero: true },
      orderBy: { numero: "asc" },
    });
    numerosRMs = rms.map((r) => r.numero);
  }
  const rotuloRMs = numerosRMs.length === 1
    ? `RM ${numerosRMs[0]}`
    : `RMs ${numerosRMs.join(", ")}`;

  const totalItens = cot.itens.length;
  const prazoTxt = cot.prazoResposta
    ? new Date(cot.prazoResposta).toLocaleDateString("pt-BR")
    : null;

  const subject = `Solicitacao de Cotacao — ${rotuloRMs} (Torg Metal)`;

  const html = `
    <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 620px; margin: 0 auto; color: #2d3748;">
      <h2 style="color: #0a3a5c; margin-top: 0;">Solicitacao de Cotacao</h2>
      <p style="color: #4a5568; line-height: 1.5;">
        Ola <strong>${escapeHtml(cot.fornecedorNome)}</strong>,
      </p>
      <p style="color: #4a5568; line-height: 1.5;">
        Estamos solicitando sua cotacao para o material listado na <strong>${escapeHtml(rotuloRMs)}</strong>.
        Acesse o link abaixo pra ver os itens e enviar sua proposta. O link e <strong>unico e privado</strong> —
        nao precisa de login.
      </p>

      <div style="text-align: center; margin: 32px 0;">
        <a href="${link}"
           style="background: #1976d2; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; display: inline-block;">
          Abrir cotacao
        </a>
      </div>

      <p style="color: #718096; font-size: 13px; line-height: 1.5;">
        Ou copie e cole esse endereco no navegador:<br>
        <span style="color: #1976d2; word-break: break-all;">${link}</span>
      </p>

      <table style="width: 100%; border-collapse: collapse; margin: 24px 0; font-size: 14px;">
        <tr><td style="padding: 6px 0; color: #718096;">Total de itens</td><td style="padding: 6px 0;"><strong>${totalItens}</strong></td></tr>
        ${prazoTxt ? `<tr><td style="padding: 6px 0; color: #718096;">Prazo de resposta</td><td style="padding: 6px 0;"><strong>${prazoTxt}</strong></td></tr>` : ""}
        ${cot.observacao ? `<tr><td style="padding: 6px 0; color: #718096; vertical-align: top;">Observacao</td><td style="padding: 6px 0;">${escapeHtml(cot.observacao)}</td></tr>` : ""}
      </table>

      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;">
      <p style="color: #a0aec0; font-size: 12px; line-height: 1.4;">
        Atenciosamente,<br>
        <strong>Equipe de Compras — Torg Metal</strong>
      </p>
    </div>
  `;

  const text = [
    `Ola ${cot.fornecedorNome},`,
    "",
    `Solicitamos cotacao para o material da ${rotuloRMs}.`,
    "Acesse o link abaixo (unico e privado) pra enviar sua proposta:",
    "",
    link,
    "",
    `Itens: ${totalItens}`,
    prazoTxt ? `Prazo: ${prazoTxt}` : null,
    cot.observacao ? `Observacao: ${cot.observacao}` : null,
    "",
    "Atenciosamente,",
    "Equipe de Compras — Torg Metal",
  ].filter(Boolean).join("\n");

  const result = await sendEmail({
    to: cot.fornecedorEmail,
    subject,
    html,
    text,
    replyTo: user.email,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error || "Falha ao enviar email" },
      { status: 502 }
    );
  }

  // Marca quando foi enviado (pode evoluir pra um modelo de log de envios)
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "enviar_email_cotacao",
      entity: "Cotacao",
      entityId: cot.id,
      diff: { email: cot.fornecedorEmail, resendId: result.id },
    },
  });

  return NextResponse.json({ ok: true, emailEnviadoPara: cot.fornecedorEmail });
}
