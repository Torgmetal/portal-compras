// GET  /api/admin/aviso-seguranca — quem receberia (para a tela conferir antes)
// POST /api/admin/aviso-seguranca — dispara o comunicado do reforço de acesso
//
// ⚠⚠ O ENVIO SAI DAQUI, NÃO DE UM SCRIPT. A RESEND_API_KEY só existe no ambiente da Vercel — na
// máquina de quem desenvolve ela é vazia, e um script local "envia" 20 e-mails que nunca saem,
// avisando no console e devolvendo sucesso para quem não está lendo. Aqui o envio roda onde a
// chave mora, com sessão de ADMIN e registro no AuditLog.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { sendEmail } from "@/lib/email";
import { htmlAvisoSeguranca, ASSUNTO_AVISO } from "@/lib/aviso-seguranca-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ⚠ SÓ USUÁRIO INTERNO. CLIENTE não tem nada a ver com isto, e FUNCIONARIO entra por CPF em
// /colaborador — o "Esqueci minha senha" citado no texto não é a porta dele.
const ondeInternos = { ativo: true, tipo: { in: ["USUARIO", "ADMIN"] } };

async function destinatarios() {
  return prisma.user.findMany({
    where: ondeInternos,
    select: { id: true, name: true, email: true, setor: true },
    orderBy: [{ setor: "asc" }, { name: "asc" }],
  });
}

export async function GET() {
  try { await requireRole(["ADMIN"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const pessoas = await destinatarios();
  // já foi hoje? a tela avisa, para o segundo clique não virar segundo e-mail
  const jaHoje = await prisma.auditLog.findFirst({
    where: { action: "AVISO_SEGURANCA_EMAIL", createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
    orderBy: { createdAt: "desc" }, select: { createdAt: true, diff: true },
  });
  return NextResponse.json({ total: pessoas.length, pessoas, jaHoje: jaHoje || null });
}

export async function POST(req) {
  let admin;
  try { admin = await requireRole(["ADMIN"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const forcar = new URL(req.url).searchParams.get("forcar") === "1";
  // ⚠ TRAVA DE DUPLO CLIQUE. Comunicado ao time inteiro não pode sair duas vezes porque a tela
  // demorou a responder — o envio leva ~15s e o botão fica parado nesse tempo.
  if (!forcar) {
    const jaHoje = await prisma.auditLog.findFirst({
      where: { action: "AVISO_SEGURANCA_EMAIL", createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
      select: { createdAt: true },
    });
    if (jaHoje) {
      return NextResponse.json({ error: "Este aviso já foi enviado hoje. Reenvie só se for de propósito." }, { status: 409 });
    }
  }

  const pessoas = await destinatarios();
  const enviados = [];
  const falhas = [];
  for (const p of pessoas) {
    const r = await sendEmail({
      to: p.email, subject: ASSUNTO_AVISO, html: htmlAvisoSeguranca(p.name),
      replyTo: admin.email || undefined,
    }).catch((e) => ({ ok: false, error: String(e?.message || e) }));
    if (r?.ok) enviados.push(p.email);
    else falhas.push({ email: p.email, erro: String(r?.error || "erro").slice(0, 120) });
  }

  await prisma.auditLog.create({
    data: { userId: admin.id || null, action: "AVISO_SEGURANCA_EMAIL", entity: "User", entityId: null,
      diff: { assunto: ASSUNTO_AVISO, enviados: enviados.length, falhas } },
  }).catch(() => {});

  return NextResponse.json({ ok: true, enviados: enviados.length, falhas });
}
