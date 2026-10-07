// POST /api/rh/holerite/disparar  { competencia, soParaMim?, somentePendentes? }
// Notifica os funcionários por e-mail que há holerite novo disponível no portal
// (/colaborador). NÃO anexa o PDF — de propósito: Matheus (07/10/2026) tirou o anexo para que o
// colaborador TENHA de abrir o holerite no portal, onde a leitura e a confirmação ficam gravadas
// (visualizadoEm/confirmadoEm/IP — base do Comprovante de ciência). Com o PDF no e-mail, ninguém entrava.
//   soParaMim=true → manda 1 e-mail de amostra pro próprio RH e não altera nada
//                    (validação segura antes do disparo em massa).
// Só ADMIN/RH.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/html";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 300;

const schema = z.object({
  competencia: z.string().regex(/^\d{4}-\d{2}$/),
  soParaMim: z.boolean().default(false),
  somentePendentes: z.boolean().default(true),
});

function competenciaExtenso(c) {
  const [ano, mes] = c.split("-");
  const nomes = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  return `${nomes[Number(mes)] || mes}/${ano}`;
}

function montarEmail({ nome, competencia, link }) {
  const ref = competenciaExtenso(competencia);
  const subject = `Seu holerite de ${ref} está disponível no portal`;
  const html = `
    <div style="font-family:Arial,sans-serif;color:#002945">
      <p>Olá, ${escapeHtml(nome)}.</p>
      <p>Seu holerite referente a <strong>${escapeHtml(ref)}</strong> já está disponível no <strong>Portal do Colaborador</strong>.</p>
      <p><a href="${link}" style="display:inline-block;background:#006EAB;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Acessar meu holerite</a></p>
      <p style="color:#576D7E;font-size:13px">Entre com seu <strong>CPF</strong> e senha. Após visualizar, <strong>confirme o recebimento</strong> na própria página.</p>
      <p style="color:#576D7E;font-size:12px">Workspace Torg — uso interno / confidencial.</p>
    </div>`;
  const text = `Seu holerite de ${ref} está disponível no Portal do Colaborador. Entre com seu CPF e senha e confirme o recebimento: ${link}`;
  return { subject, html, text };
}

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "RH"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Body inválido" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message }, { status: 400 });
  const { competencia, soParaMim, somentePendentes } = parsed.data;

  const origin = process.env.NEXTAUTH_URL || new URL(req.url).origin;
  const link = `${origin}/colaborador`;

  // Modo seguro: e-mail de amostra só pro RH logado, sem tocar no banco.
  if (soParaMim) {
    const amostra = montarEmail({ nome: user.name || "Funcionário", competencia, link });
    const res = await sendEmail({ to: user.email, ...amostra });
    return res.ok
      ? NextResponse.json({ success: true, modo: "amostra", para: user.email })
      : NextResponse.json({ success: false, error: res.error || "Falha ao enviar amostra" }, { status: 502 });
  }

  const holerites = await prisma.holerite.findMany({
    where: { competencia, ...(somentePendentes ? { status: "PENDENTE" } : {}) },
    select: { id: true, funcionario: { select: { nome: true, email: true } } },
  });

  let enviados = 0; const semEmail = []; const falhas = [];
  for (const h of holerites) {
    const email = h.funcionario?.email;
    if (!email) { semEmail.push(h.funcionario?.nome || h.id); continue; }

    const msg = montarEmail({ nome: h.funcionario.nome, competencia, link });
    const res = await sendEmail({ to: email, ...msg });
    if (res.ok) {
      await prisma.holerite.update({ where: { id: h.id }, data: { status: "ENVIADO", enviadoEm: new Date() } });
      enviados++;
    } else {
      falhas.push(h.funcionario?.nome || h.id);
    }
  }

  await prisma.auditLog.create({
    data: { userId: user.id, action: "DISPARAR_HOLERITE", entity: "Holerite", entityId: competencia, diff: { competencia, enviados, semEmail: semEmail.length, falhas: falhas.length } },
  }).catch(() => {});

  return NextResponse.json({ success: true, enviados, semEmail, falhas, total: holerites.length });
}
