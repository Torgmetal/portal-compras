import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { sendEmail } from "@/lib/email";

const DEPT_TO_ROLES = {
  COMERCIAL: ["COMERCIAL"],
  ENGENHARIA: ["ENGENHARIA"],
  SUPRIMENTOS: ["COMPRAS"],
  FABRICACAO: ["PRODUCAO"],
  EXPEDICAO: ["EXPEDICAO"],
  MONTAGEM: ["PRODUCAO", "EXPEDICAO"],
};

const DEPT_LABEL = {
  COMERCIAL: "Comercial",
  ENGENHARIA: "Engenharia",
  SUPRIMENTOS: "Suprimentos",
  FABRICACAO: "Fabricação",
  EXPEDICAO: "Expedição",
  MONTAGEM: "Montagem",
};

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "PLANEJAMENTO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  const { id } = await params;

  // Aceita filtro opcional por departamento(s) no body
  let filtroDepts = null;
  try {
    const body = await req.json();
    if (body.departamentos && Array.isArray(body.departamentos)) {
      filtroDepts = body.departamentos;
    } else if (body.departamento && typeof body.departamento === "string") {
      filtroDepts = [body.departamento];
    }
  } catch {
    // body vazio ou invalido — notifica todos os atrasados
  }

  const cronograma = await prisma.cronograma.findUnique({
    where: { id },
    include: {
      op: { select: { numero: true, cliente: true, obra: true } },
      tarefas: {
        where: { percentualRealizado: { lt: 100 } },
        orderBy: { uidMpp: "asc" },
      },
    },
  });

  if (!cronograma) {
    return NextResponse.json({ success: false, error: "Cronograma nao encontrado" }, { status: 404 });
  }

  const now = new Date();
  const atrasadosPorDept = {};

  for (const t of cronograma.tarefas) {
    if (!t.departamento || !t.dataFimPrevista) continue;
    if (new Date(t.dataFimPrevista) >= now) continue;
    if (t.isSummary && t.outlineLevel === 0) continue;
    // Se filtro de departamento foi especificado, ignorar os demais
    if (filtroDepts && !filtroDepts.includes(t.departamento)) continue;

    if (!atrasadosPorDept[t.departamento]) atrasadosPorDept[t.departamento] = [];
    atrasadosPorDept[t.departamento].push(t);
  }

  const depts = Object.keys(atrasadosPorDept);
  if (depts.length === 0) {
    return NextResponse.json({ success: true, enviados: 0, motivo: "Nenhum departamento atrasado" });
  }

  const allRoles = [...new Set(depts.flatMap((d) => DEPT_TO_ROLES[d] || []))];
  const usuarios = await prisma.user.findMany({
    where: { ativo: true, role: { in: allRoles }, email: { not: null } },
    select: { email: true, role: true, name: true },
  });

  const adminUsers = await prisma.user.findMany({
    where: { ativo: true, role: "ADMIN", email: { not: null } },
    select: { email: true },
  });
  const ccEmails = adminUsers.map((u) => u.email).filter(Boolean);

  const opLabel = cronograma.op
    ? `OP ${cronograma.op.numero} — ${cronograma.op.cliente} — ${cronograma.op.obra || ""}`
    : cronograma.titulo;

  const resultados = [];

  for (const dept of depts) {
    const roles = DEPT_TO_ROLES[dept] || [];
    const destinatarios = usuarios
      .filter((u) => roles.includes(u.role))
      .map((u) => u.email)
      .filter(Boolean);

    if (destinatarios.length === 0) {
      resultados.push({ dept, enviado: false, motivo: "Sem usuarios com email" });
      continue;
    }

    const tarefas = atrasadosPorDept[dept];
    const tarefasHtml = tarefas
      .filter((t) => !t.isSummary)
      .slice(0, 20)
      .map((t) => {
        const dias = Math.ceil((now - new Date(t.dataFimPrevista)) / 86400000);
        return `<tr>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;">${t.nome}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center;">${t.percentualRealizado}%</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center;">${new Date(t.dataFimPrevista).toLocaleDateString("pt-BR")}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center;color:#dc2626;font-weight:600;">${dias}d</td>
        </tr>`;
      })
      .join("");

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <div style="background:#002945;padding:16px 24px;border-radius:8px 8px 0 0;">
          <h2 style="color:#fff;margin:0;font-size:16px;">⚠️ Alerta de Atraso — ${DEPT_LABEL[dept] || dept}</h2>
        </div>
        <div style="padding:20px 24px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
          <p style="margin:0 0 12px;color:#374151;font-size:14px;">
            O departamento <strong>${DEPT_LABEL[dept] || dept}</strong> possui
            <strong style="color:#dc2626;">${tarefas.filter((t) => !t.isSummary).length} tarefa(s) atrasada(s)</strong>
            no cronograma <strong>${opLabel}</strong>.
          </p>
          <table style="width:100%;border-collapse:collapse;font-size:13px;margin:16px 0;">
            <thead>
              <tr style="background:#f3f4f6;">
                <th style="padding:8px 10px;text-align:left;font-weight:600;color:#576D7E;">Tarefa</th>
                <th style="padding:8px 10px;text-align:center;font-weight:600;color:#576D7E;">Realizado</th>
                <th style="padding:8px 10px;text-align:center;font-weight:600;color:#576D7E;">Prazo</th>
                <th style="padding:8px 10px;text-align:center;font-weight:600;color:#576D7E;">Atraso</th>
              </tr>
            </thead>
            <tbody>${tarefasHtml}</tbody>
          </table>
          <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;">
            Acesse o <a href="${process.env.NEXTAUTH_URL || "https://portal.torg.com.br"}/planejamento/cronogramas" style="color:#006EAB;">Portal de Cronogramas</a> para atualizar o progresso.
          </p>
        </div>
      </div>`;

    const result = await sendEmail({
      to: destinatarios,
      cc: ccEmails,
      subject: `[Atraso] ${DEPT_LABEL[dept] || dept} — ${opLabel}`,
      html,
    });

    resultados.push({ dept: DEPT_LABEL[dept], enviado: result.ok, destinatarios: destinatarios.length, id: result.id });
  }

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "NOTIFICAR_ATRASOS_CRONOGRAMA",
      entity: "Cronograma",
      entityId: id,
      diff: { resultados },
    },
  });

  return NextResponse.json({ success: true, resultados });
}
