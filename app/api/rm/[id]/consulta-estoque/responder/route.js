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
    user = await requireRole(["ADMIN", "PRODUCAO", "ENGENHARIA"]);
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

  // Email para quem criou — busca itens com rmItem para montar tabela
  if (consulta.createdBy.email) {
    const consultaCompleta = await prisma.consultaEstoque.findUnique({
      where: { id: body.consultaId },
      include: {
        itens: {
          include: { rmItem: { select: { descricao: true, unidade: true, qtd: true, peso: true } } },
        },
      },
    });

    const baseUrl = process.env.NEXTAUTH_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
    const linkRM = `${baseUrl}/compras/rm/${consulta.rm.id}`;

    const corStatus = { DISPONIVEL: "#38a169", PARCIAL: "#d69e2e", INDISPONIVEL: "#c53030" };
    const labelStatus = { DISPONIVEL: "Disponivel", PARCIAL: "Parcial", INDISPONIVEL: "Indisponivel" };

    const itensRows = (consultaCompleta?.itens || []).map((it, i) => {
      const resp = body.itens.find((r) => r.consultaItemId === it.id);
      const qtdLabel = (it.rmItem?.peso || 0) > 0
        ? `${Number(it.rmItem.peso).toLocaleString("pt-BR")} KG`
        : `${Number(it.rmItem?.qtd).toLocaleString("pt-BR")} ${it.rmItem?.unidade}`;
      const bg = i % 2 === 0 ? "#ffffff" : "#f7fafc";
      const statusCor = resp ? corStatus[resp.resposta] || "#718096" : "#718096";
      const statusLabel = resp ? labelStatus[resp.resposta] || "—" : "—";
      const qtdDisp = resp?.resposta === "PARCIAL" && resp.qtdDisponivel != null ? resp.qtdDisponivel : "";
      const obs = resp?.observacao || "";
      return `<tr style="background:${bg};">
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#2d3748;font-size:13px;">${it.rmItem?.descricao || "—"}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#4a5568;font-size:13px;text-align:right;white-space:nowrap;">${qtdLabel}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:center;">
          <span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;color:#ffffff;background:${statusCor};">${statusLabel}</span>
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#4a5568;font-size:13px;text-align:right;">${qtdDisp}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#718096;font-size:12px;">${obs}</td>
      </tr>`;
    }).join("");

    await sendEmail({
      to: consulta.createdBy.email,
      subject: `Estoque respondido — RM ${consulta.rm.numero} (${opLabel})`,
      html: `
        <div style="font-family:-apple-system,system-ui,sans-serif;max-width:700px;margin:0 auto;color:#2d3748;">
          <h2 style="color:#006EAB;margin-top:0;">Resposta da Consulta de Estoque</h2>

          <p style="color:#4a5568;line-height:1.6;">
            <strong>${user.name}</strong> respondeu a sua consulta de estoque para a
            <strong>RM ${consulta.rm.numero}</strong> (${opLabel}).
          </p>

          <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px;">
            <tr><td style="padding:6px 0;color:#718096;width:160px;">Requisicao</td><td style="padding:6px 0;"><strong>RM ${consulta.rm.numero}</strong></td></tr>
            <tr><td style="padding:6px 0;color:#718096;">Referencia</td><td style="padding:6px 0;">${opLabel}</td></tr>
            <tr><td style="padding:6px 0;color:#718096;">Respondido por</td><td style="padding:6px 0;">${user.name}</td></tr>
            <tr><td style="padding:6px 0;color:#718096;">Resumo</td><td style="padding:6px 0;"><strong>${resumoText}</strong></td></tr>
          </table>

          <p style="color:#2d3748;font-weight:700;font-size:14px;margin-bottom:8px;">Detalhamento por item:</p>
          <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
            <tr style="background:#002945;">
              <th style="padding:10px 12px;text-align:left;color:#ffffff;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Descricao</th>
              <th style="padding:10px 12px;text-align:right;color:#ffffff;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Qtd</th>
              <th style="padding:10px 12px;text-align:center;color:#ffffff;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Status</th>
              <th style="padding:10px 12px;text-align:right;color:#ffffff;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Disp.</th>
              <th style="padding:10px 12px;text-align:left;color:#ffffff;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Obs.</th>
            </tr>
            ${itensRows}
          </table>

          <div style="text-align:center;margin:32px 0;">
            <a href="${linkRM}"
               style="display:inline-block;background:#006EAB;color:#ffffff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;">
              Ver RM no sistema
            </a>
          </div>

          <p style="color:#718096;font-size:12px;line-height:1.5;">
            Ou copie e cole esse endereco no navegador:<br>
            <a href="${linkRM}" style="color:#006EAB;word-break:break-all;">${linkRM}</a>
          </p>

          <hr style="border:0;border-top:1px solid #e2e8f0;margin:24px 0;">
          <p style="color:#a0aec0;font-size:12px;line-height:1.4;">
            Atenciosamente,<br>
            <strong>Equipe Torg Metal</strong>
          </p>
        </div>
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
