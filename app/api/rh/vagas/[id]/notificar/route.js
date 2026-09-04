// POST /api/rh/vagas/[id]/notificar — dispara e-mail de aprovação de vaga.
//   tipo "SOLICITAR_APROVACAO": avisa os aprovadores (ADMIN) que há vaga aguardando OK.
//   tipo "APROVADA":            avisa o time de RH que a vaga foi liberada p/ recrutar.
// Padrão de e-mail do portal: cabecalhoEmail() (navy + filete laranja) + botão #006EAB.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { sendEmail } from "@/lib/email";
import { cabecalhoEmail } from "@/lib/email-layout";
import { escapeHtml } from "@/lib/html";
import { baseUrlDe } from "@/lib/databook-assinaturas";
import { SEM_EXTERNOS } from "@/lib/usuarios-internos";

export const runtime = "nodejs";
export const maxDuration = 30;

const schema = z.object({ tipo: z.enum(["SOLICITAR_APROVACAO", "APROVADA"]) });

// modulos vêm do banco como array de objetos {modulo}, mas como strings na sessão.
const norm = (m) => (Array.isArray(m) ? m.map((x) => (typeof x === "string" ? x : x?.modulo)).filter(Boolean) : []);

const TIPO_LABEL = { CLT: "CLT", PJ: "PJ", ESTAGIO: "Estágio", TEMPORARIO: "Temporário" };
const PRIO_LABEL = { URGENTE: "Urgente", ALTA: "Alta", NORMAL: "Normal", BAIXA: "Baixa" };

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "RH"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ success: false, error: "Dados inválidos" }, { status: 400 });
  }

  const vaga = await prisma.vaga.findUnique({ where: { id: params.id }, include: { setor: true, cargo: true } });
  if (!vaga) return NextResponse.json({ success: false, error: "Vaga não encontrada" }, { status: 404 });

  const users = await prisma.user.findMany({
    where: { ativo: true, ...SEM_EXTERNOS, tipo: { not: "FUNCIONARIO" } },
    select: { name: true, email: true, tipo: true, modulos: true },
  });

  const base = baseUrlDe(req);
  const link = `${base}/rh/vagas`;
  let to, subject, tituloEmail, intro, cta;

  if (body.tipo === "SOLICITAR_APROVACAO") {
    to = users.filter((u) => u.tipo === "ADMIN").map((u) => u.email);
    subject = `Aprovação de vaga: ${vaga.titulo}`;
    tituloEmail = "Aprovação de vaga solicitada";
    intro = `<strong>${escapeHtml(user.name || "O RH")}</strong> solicitou a abertura de uma vaga e aguarda a sua aprovação no portal.`;
    cta = "Revisar e aprovar";
  } else {
    to = users.filter((u) => norm(u.modulos).includes("RH")).map((u) => u.email);
    subject = `Vaga aprovada: ${vaga.titulo} — pode recrutar`;
    tituloEmail = "Vaga aprovada — pode recrutar";
    intro = `A vaga abaixo foi <strong>aprovada</strong> e está liberada para iniciar o recrutamento.`;
    cta = "Abrir no portal";
  }
  to = [...new Set(to.filter(Boolean))];
  if (to.length === 0) {
    return NextResponse.json({ success: false, error: "Nenhum destinatário encontrado para este aviso." }, { status: 400 });
  }

  const linha = (rot, val) =>
    val
      ? `<tr><td style="padding:5px 14px 5px 0;color:#64748b;font-size:13px;vertical-align:top;white-space:nowrap;">${rot}</td><td style="padding:5px 0;font-size:13px;color:#0f172a;"><strong>${escapeHtml(String(val))}</strong></td></tr>`
      : "";

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;">
    ${cabecalhoEmail(tituloEmail)}
    <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:20px 24px;">
      <p style="font-size:14px;color:#334155;margin:0 0 16px;line-height:1.5;">${intro}</p>
      <table style="border-collapse:collapse;margin-bottom:18px;">
        ${linha("Vaga", vaga.titulo)}
        ${linha("Setor", vaga.setor?.nome)}
        ${linha("Cargo", vaga.cargo?.nome)}
        ${linha("Quantidade", `${vaga.quantidade} vaga${vaga.quantidade !== 1 ? "s" : ""}`)}
        ${linha("Tipo", TIPO_LABEL[vaga.tipo] || vaga.tipo)}
        ${linha("Prioridade", PRIO_LABEL[vaga.prioridade] || vaga.prioridade)}
        ${linha("Faixa salarial", vaga.salarioFaixa)}
        ${linha("Justificativa", vaga.justificativa)}
        ${linha("Requisitos", vaga.requisitos)}
      </table>
      <a href="${link}" style="display:inline-block;background:#006EAB;color:#fff;text-decoration:none;font-size:14px;font-weight:bold;padding:11px 22px;border-radius:8px;">${cta}</a>
    </div>
    <p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:14px;">Torg Metal · Portal de RH</p>
  </div>`;

  const r = await sendEmail({ to, subject, html, replyTo: user.email || undefined });
  if (!r.ok) return NextResponse.json({ success: false, error: r.error || "Falha ao enviar e-mail" }, { status: 502 });

  await prisma.auditLog
    .create({
      data: {
        userId: user.id || null,
        action: body.tipo === "APROVADA" ? "AVISAR_RH_VAGA" : "SOLICITAR_APROVACAO_VAGA",
        entity: "Vaga",
        entityId: vaga.id,
        diff: { destinatarios: to },
      },
    })
    .catch(() => {});

  return NextResponse.json({ success: true, enviados: to.length, destinatarios: to });
}
