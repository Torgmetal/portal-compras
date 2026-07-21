// POST /api/comercial/op/[id]/atas/[ataId]/enviar
// Envia a ata ao cliente por e-mail (link público por token) pra ACEITE.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { sendEmail } from "@/lib/email";
import { gerarTokenForte } from "@/lib/token";

export const runtime = "nodejs";
const ROLES = ["ADMIN", "COMERCIAL", "PLANEJAMENTO", "PCP"];
const BASE = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || "https://workspace.torg.com.br";
const esc = (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmtOP = (n) => `OP-${String(n).padStart(3, "0")}`;

export async function POST(req, { params }) {
  let user;
  try { user = await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const ata = await prisma.ataOP.findFirst({ where: { id: params.ataId, opId: params.id }, include: { op: { select: { cliente: true, obra: true } } } });
  if (!ata) return NextResponse.json({ error: "Ata não encontrada" }, { status: 404 });
  if (!ata.conteudoJson && !ata.pauta) return NextResponse.json({ error: "Preencha a ata (texto ou IA) antes de enviar." }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const email = String(body.email || ata.clienteEmail || "").trim();
  if (!email || !email.includes("@")) return NextResponse.json({ error: "Informe o e-mail do cliente." }, { status: 400 });
  const nome = String(body.nome || ata.clienteNome || ata.op?.cliente || "Cliente").trim();

  const token = ata.tokenCliente || gerarTokenForte();
  const link = `${BASE}/ata-op/${token}`;
  const codigo = `${fmtOP(ata.opNumero)} · ATA #${String(ata.numero).padStart(2, "0")}`;

  const html = `
  <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#00263F">
    <div style="background:#0D1F3C;color:#fff;padding:22px 24px;border-radius:12px 12px 0 0">
      <h1 style="margin:0;font-size:20px">Torg Metal — Estruturas Metálicas</h1>
    </div>
    <div style="height:4px;background:#F4801F;"></div>
    <div style="border:1px solid #E2E9F0;border-top:0;border-radius:0 0 12px 12px;padding:24px">
      <p style="font-size:15px">Olá, <strong>${esc(nome)}</strong>,</p>
      <p style="font-size:14px;line-height:1.55;color:#123549">Segue a <strong>ata da reunião</strong> ${esc(codigo)}${ata.op?.obra ? ` — obra ${esc(ata.op.obra)}` : ""}${ata.titulo ? `: <em>${esc(ata.titulo)}</em>` : ""}. Por favor, revise as informações e registre o seu <strong>aceite</strong> pelo botão abaixo.</p>
      <p style="text-align:center;margin:26px 0">
        <a href="${link}" style="background:#F4801F;color:#fff;text-decoration:none;font-weight:700;padding:13px 26px;border-radius:8px;display:inline-block">Ver a ata e aceitar</a>
      </p>
      <p style="font-size:12px;color:#5C7285">Ou copie este link: <br><a href="${link}" style="color:#006EAB">${link}</a></p>
    </div>
  </div>`;

  try { await sendEmail({ to: email, subject: `${codigo} — Ata de reunião para aceite (Torg Metal)`, html }); }
  catch (e) { return NextResponse.json({ error: "Falha ao enviar e-mail: " + (e?.message || "") }, { status: 500 }); }

  const atualizada = await prisma.ataOP.update({ where: { id: ata.id }, data: { status: ata.status === "ACEITA" ? "ACEITA" : "ENVIADA", enviadoEm: new Date(), clienteEmail: email, clienteNome: nome.slice(0, 120), tokenCliente: token } });
  await prisma.auditLog.create({ data: { userId: user.id, action: "ENVIAR_ATA_OP", entity: "AtaOP", entityId: ata.id, diff: { email, numero: ata.numero } } }).catch(() => {});
  return NextResponse.json({ success: true, ata: atualizada });
}
