import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/html";
import { z } from "zod";

const DEPT_LABEL = {
  COMERCIAL: "Comercial",
  ENGENHARIA: "Engenharia",
  SUPRIMENTOS: "Suprimentos",
  FABRICACAO: "Fabricação",
  EXPEDICAO: "Expedição",
  MONTAGEM: "Montagem",
};

const DEPT_TO_MODULOS = {
  COMERCIAL: ["COMERCIAL"],
  ENGENHARIA: ["ENGENHARIA"],
  SUPRIMENTOS: ["COMPRAS"],
  FABRICACAO: ["PRODUCAO"],
  EXPEDICAO: ["EXPEDICAO"],
  MONTAGEM: ["PRODUCAO", "EXPEDICAO"],
};

const bodySchema = z.object({
  emails: z.array(z.string().email()).min(1, "Informe ao menos um e-mail"),
  mensagem: z.string().max(500).optional(),
});

// GET — retorna emails sugeridos para esta tarefa (por departamento + cliente da OP)
export async function GET(req, { params }) {
  try {
    await requireRole(["ADMIN", "PLANEJAMENTO", "PRODUCAO", "COMERCIAL"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  const { id } = await params;

  const tarefa = await prisma.cronogramaTarefa.findUnique({
    where: { id },
    include: {
      cronograma: {
        select: {
          op: { select: { clienteEmail: true, clienteContato: true, cliente: true } },
        },
      },
    },
  });

  if (!tarefa) {
    return NextResponse.json({ success: false, error: "Tarefa não encontrada" }, { status: 404 });
  }

  // Emails por módulo/departamento
  const modulosAlvo = DEPT_TO_MODULOS[tarefa.departamento] || [];
  const usuarios = modulosAlvo.length > 0
    ? await prisma.user.findMany({
        where: {
          ativo: true,
          modulos: { some: { modulo: { in: modulosAlvo } } },
        },
        select: { email: true, name: true },
      })
    : [];

  const sugeridos = usuarios
    .filter((u) => u.email)
    .map((u) => ({ email: u.email, nome: u.name, origem: "setor" }));

  // Email do cliente (da OP vinculada)
  const op = tarefa.cronograma?.op;
  if (op?.clienteEmail) {
    sugeridos.push({
      email: op.clienteEmail,
      nome: op.clienteContato || op.cliente || "Cliente",
      origem: "cliente",
    });
  }

  return NextResponse.json({ success: true, sugeridos });
}

// POST — envia notificação para os emails selecionados
export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "PLANEJAMENTO", "PRODUCAO", "COMERCIAL"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const tarefa = await prisma.cronogramaTarefa.findUnique({
    where: { id },
    include: {
      cronograma: {
        select: {
          opNumero: true,
          titulo: true,
          op: { select: { numero: true, cliente: true, obra: true } },
        },
      },
    },
  });

  if (!tarefa) {
    return NextResponse.json({ success: false, error: "Tarefa não encontrada" }, { status: 404 });
  }

  const { emails, mensagem } = parsed.data;
  const now = new Date();
  const dept = DEPT_LABEL[tarefa.departamento] || tarefa.departamento || "—";
  const opLabel = tarefa.cronograma.op
    ? `OP-${tarefa.cronograma.op.numero.padStart(3, "0")} — ${tarefa.cronograma.op.cliente}`
    : tarefa.cronograma.titulo;

  const atrasada = tarefa.dataFimPrevista && new Date(tarefa.dataFimPrevista) < now && tarefa.percentualRealizado < 100;
  const diasAtraso = atrasada ? Math.ceil((now - new Date(tarefa.dataFimPrevista)) / 86400000) : 0;

  const statusLabel = tarefa.percentualRealizado >= 100
    ? "✅ Concluída"
    : atrasada
    ? `🔴 Atrasada (${diasAtraso} dias)`
    : "🟡 Em andamento";

  const fmtData = (d) => d ? new Date(d).toLocaleDateString("pt-BR") : "—";
  const mensagemExtra = mensagem ? `<p style="margin:16px 0 0;padding:12px;background:#FEF3C7;border-radius:6px;color:#92400E;font-size:13px;"><strong>Mensagem do Planejamento:</strong><br/>${escapeHtml(mensagem).replace(/\n/g, "<br/>")}</p>` : "";

  const subject = atrasada
    ? `⚠️ [Atraso] ${tarefa.nome} — ${opLabel}`
    : `📋 Atividade do Cronograma — ${tarefa.nome} — ${opLabel}`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:${atrasada ? "#991B1B" : "#006EAB"};color:white;padding:16px 24px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;font-size:16px;">${atrasada ? "⚠️ Alerta de Atraso" : "📋 Notificação de Atividade"}</h2>
        <p style="margin:4px 0 0;font-size:12px;opacity:0.9;">Workspace Torg — Planejamento</p>
      </div>
      <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
        <table style="width:100%;font-size:14px;border-collapse:collapse;">
          <tr>
            <td style="padding:8px 0;color:#576D7E;font-weight:600;width:130px;">Atividade:</td>
            <td style="padding:8px 0;color:#002945;font-weight:700;">${escapeHtml(tarefa.nome)}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#576D7E;font-weight:600;">OP:</td>
            <td style="padding:8px 0;color:#006EAB;font-family:monospace;font-weight:600;">${escapeHtml(opLabel)}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#576D7E;font-weight:600;">Departamento:</td>
            <td style="padding:8px 0;color:#002945;">${escapeHtml(dept)}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#576D7E;font-weight:600;">Status:</td>
            <td style="padding:8px 0;color:${atrasada ? "#dc2626" : "#002945"};font-weight:600;">${statusLabel}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#576D7E;font-weight:600;">Início previsto:</td>
            <td style="padding:8px 0;color:#002945;">${fmtData(tarefa.dataInicioPrevista)}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#576D7E;font-weight:600;">Fim previsto:</td>
            <td style="padding:8px 0;color:${atrasada ? "#dc2626" : "#002945"};font-weight:${atrasada ? "700" : "400"};">${fmtData(tarefa.dataFimPrevista)}${atrasada ? ` (${diasAtraso}d de atraso)` : ""}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#576D7E;font-weight:600;">Realizado:</td>
            <td style="padding:8px 0;color:#002945;">${tarefa.percentualRealizado}%</td>
          </tr>
        </table>
        ${mensagemExtra}
        <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e5e7eb;">
          <p style="font-size:12px;color:#576D7E;margin:0;">
            Enviado por <strong>${user.name || "Planejamento"}</strong> via Workspace Torg em ${now.toLocaleDateString("pt-BR")}.
          </p>
        </div>
      </div>
    </div>`;

  const resultado = await sendEmail({ to: emails, subject, html });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "NOTIFICAR_ATIVIDADE_CRONOGRAMA",
      entity: "CronogramaTarefa",
      entityId: id,
      diff: {
        tarefa: tarefa.nome,
        departamento: tarefa.departamento,
        opNumero: tarefa.cronograma.opNumero,
        emails,
        atrasada,
        mensagem: mensagem || null,
        emailOk: resultado.ok,
      },
    },
  });

  if (!resultado.ok) {
    return NextResponse.json({ success: false, error: `Falha ao enviar: ${resultado.error}` }, { status: 500 });
  }

  return NextResponse.json({ success: true, enviados: emails.length, emails });
}
