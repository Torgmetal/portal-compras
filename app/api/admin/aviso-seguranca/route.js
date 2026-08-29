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
import { htmlAvisoSeguranca, ASSUNTO_AVISO, AVISO_PADRAO } from "@/lib/aviso-seguranca-email";
import { z } from "zod";

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
  return NextResponse.json({ total: pessoas.length, pessoas, jaHoje: jaHoje || null, padrao: AVISO_PADRAO });
}

// ⚠ O QUE O ADMIN PODE ESCREVER. Só texto: a moldura (faixa navy, filete laranja, os blocos) é
// código, e o conteúdo é escapado antes de virar HTML — ver lib/aviso-seguranca-email.
const schemaConteudo = z.object({
  assunto:    z.string().min(4).max(180),
  titulo:     z.string().min(2).max(120),
  abertura:   z.string().max(2000),
  chamada:    z.string().max(200).optional().default(""),
  blocos:     z.array(z.object({ titulo: z.string().max(160), texto: z.string().max(2000) })).max(6).optional().default([]),
  botao:      z.string().max(60).optional().default(""),
  fechamento: z.string().max(2000).optional().default(""),
  rodape:     z.string().max(300).optional().default(""),
}).partial({ abertura: true });

export async function POST(req) {
  let admin;
  try { admin = await requireRole(["ADMIN"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const corpo = await req.json().catch(() => ({}));
  let conteudo = AVISO_PADRAO;
  if (corpo && Object.keys(corpo).length && corpo.conteudo) {
    const r = schemaConteudo.safeParse(corpo.conteudo);
    if (!r.success) return NextResponse.json({ error: r.error.issues?.[0]?.message || "Texto inválido." }, { status: 400 });
    conteudo = { ...AVISO_PADRAO, ...r.data };
  }

  // ⚠⚠ A PRÉVIA USA O MESMO CAMINHO DO ENVIO. Montar o HTML de novo no navegador só para mostrar
  // criaria duas versões do mesmo e-mail, e a que o time recebe seria a que ninguém revisou.
  if (corpo?.previa) {
    return NextResponse.json({ ok: true, previa: true, html: htmlAvisoSeguranca(admin.name || "Vitor", conteudo), assunto: conteudo.assunto });
  }

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
      to: p.email, subject: conteudo.assunto || ASSUNTO_AVISO, html: htmlAvisoSeguranca(p.name, conteudo),
      replyTo: admin.email || undefined,
    }).catch((e) => ({ ok: false, error: String(e?.message || e) }));
    if (r?.ok) enviados.push(p.email);
    else falhas.push({ email: p.email, erro: String(r?.error || "erro").slice(0, 120) });
  }

  await prisma.auditLog.create({
    data: { userId: admin.id || null, action: "AVISO_SEGURANCA_EMAIL", entity: "User", entityId: null,
      // ⚠ o texto vai gravado: daqui a um mês, "o que exatamente foi dito ao time?" só tem
      // resposta se a mensagem estiver no registro, não só a contagem.
      diff: { assunto: conteudo.assunto, conteudo, enviados: enviados.length, falhas } },
  }).catch(() => {});

  return NextResponse.json({ ok: true, enviados: enviados.length, falhas });
}
