import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { sendEmail } from "@/lib/email";

export const runtime = "nodejs";

const BASE = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || "https://workspace.torg.com.br";
const esc = (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMERCIAL"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const ap = await prisma.apresentacaoCliente.findUnique({ where: { id } });
  if (!ap) return NextResponse.json({ success: false, error: "Não encontrada" }, { status: 404 });
  if (ap.status !== "PUBLICADO" || !ap.token) return NextResponse.json({ success: false, error: "Publique a apresentação antes de enviar." }, { status: 400 });

  const email = (body.email || ap.clienteEmail || "").trim();
  if (!email || !email.includes("@")) return NextResponse.json({ success: false, error: "Informe o e-mail do cliente." }, { status: 400 });

  const link = `${BASE}/apresentacao/${ap.token}`;
  const html = `
  <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#00263F">
    <div style="background:#0D1F3C;color:#fff;padding:22px 24px;border-radius:12px 12px 0 0">
      <h1 style="margin:0;font-size:20px">Torg Metal — Estruturas Metálicas</h1>
    </div>
    <div style="height:4px;background:#F4801F;"></div>
    <div style="border:1px solid #E2E9F0;border-top:0;border-radius:0 0 12px 12px;padding:24px">
      <p style="font-size:15px">Olá, <strong>${esc(ap.contato)}</strong>${ap.empresa ? ` (${esc(ap.empresa)})` : ""},</p>
      <p style="font-size:14px;line-height:1.55;color:#123549">${esc(ap.mensagemBoasVindas || "Preparamos uma página com a apresentação da Torg Metal, nossos documentos cadastrais e portfólio. Acesse pelo botão abaixo.")}</p>
      <p style="text-align:center;margin:26px 0">
        <a href="${link}" style="background:#F4801F;color:#fff;text-decoration:none;font-weight:700;padding:13px 26px;border-radius:8px;display:inline-block">Acessar apresentação</a>
      </p>
      <p style="font-size:12px;color:#5C7285">Ou copie este link: <br><a href="${link}" style="color:#006EAB">${link}</a></p>
    </div>
  </div>`;

  try {
    await sendEmail({ to: email, subject: `Apresentação Torg Metal — ${ap.empresa}`, html });
  } catch (e) {
    return NextResponse.json({ success: false, error: "Falha ao enviar e-mail: " + (e?.message || "") }, { status: 500 });
  }

  const apresentacao = await prisma.apresentacaoCliente.update({ where: { id }, data: { enviadoEmailEm: new Date(), clienteEmail: email } });
  await prisma.auditLog.create({ data: { userId: user.id, action: "ENVIAR_APRESENTACAO", entity: "ApresentacaoCliente", entityId: id, diff: { email } } });
  return NextResponse.json({ success: true, apresentacao });
}
