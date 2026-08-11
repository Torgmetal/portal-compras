// Envio do Plano de Treinamentos p/ assinatura dos setores (e-mail + link por token).
// GET lista os envios/assinaturas · POST cria um envio (snapshot + revisão) e dispara os e-mails.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { gerarTokenForte } from "@/lib/token";
import { getRevisao, fmtRev } from "@/lib/assinatura-doc";
import { gerarPlanoTreinamentoPDF } from "@/lib/plano-treinamento-pdf";
import { sendEmail } from "@/lib/email";
import { cabecalhoEmail } from "@/lib/email-layout";
import { baseUrlDe } from "@/lib/databook-assinaturas";

export const runtime = "nodejs";
export const maxDuration = 60;
const TIPO = "PLANO_TREINAMENTO";

export async function GET() {
  try { await requireRole(["ADMIN", "RH"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const envios = await prisma.envioAssinatura.findMany({
    where: { tipo: TIPO },
    orderBy: { enviadoEm: "desc" },
    select: { id: true, revisao: true, titulo: true, enviadoEm: true, assinaturas: { select: { id: true, nome: true, setor: true, email: true, assinadoEm: true, ip: true }, orderBy: { nome: "asc" } } },
    take: 30,
  });
  return NextResponse.json({ envios, revisaoAtual: await getRevisao(TIPO) });
}

export async function POST(req) {
  let user;
  try { user = await requireRole(["ADMIN", "RH"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const body = await req.json().catch(() => ({}));
  const dest = Array.isArray(body?.destinatarios)
    ? body.destinatarios.map((d) => ({ nome: String(d?.nome || "").trim(), email: String(d?.email || "").trim(), setor: String(d?.setor || "").trim() || null })).filter((d) => d.nome && /.+@.+\..+/.test(d.email))
    : [];
  if (!dest.length) return NextResponse.json({ error: "Informe ao menos um destinatário (nome + e-mail válido)." }, { status: 400 });

  const treinamentos = await prisma.treinamento.findMany({ orderBy: { dataInicio: "asc" }, select: { titulo: true, nrRelacionada: true, dataInicio: true, cargaHoraria: true, tipo: true } });
  const revisao = await getRevisao(TIPO);
  const ano = treinamentos[0]?.dataInicio ? new Date(treinamentos[0].dataInicio).getUTCFullYear() : new Date().getUTCFullYear();
  const titulo = `Plano Anual de Treinamentos ${ano} — ${fmtRev(revisao)}`;

  const envio = await prisma.envioAssinatura.create({
    data: { tipo: TIPO, revisao, titulo, snapshot: { ano, revisao, treinamentos }, enviadoPorId: user.id || null },
  });

  const pdfB64 = Buffer.from(await gerarPlanoTreinamentoPDF({ ano, revisao, treinamentos })).toString("base64");
  const base = baseUrlDe(req);
  let enviados = 0;

  for (const d of dest) {
    const token = gerarTokenForte(24);
    await prisma.assinaturaDocumento.create({ data: { envioId: envio.id, nome: d.nome, email: d.email, setor: d.setor, token } });
    const link = `${base}/assinar/${token}`;
    const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0D1F3C">
      ${cabecalhoEmail("Assinatura — Plano de Treinamentos")}
      <div style="border:1px solid #e7ecf2;border-top:none;border-radius:0 0 8px 8px;padding:20px 24px">
        <p style="margin:0 0 10px">Olá, <strong>${d.nome}</strong>,</p>
        <p style="margin:0 0 12px">Segue para validação o <strong>${titulo}</strong>. O documento está em anexo neste e-mail. Confira e registre sua <strong>assinatura eletrônica</strong> no botão abaixo.</p>
        <p style="text-align:center;margin:22px 0">
          <a href="${link}" style="background:#006EAB;color:#fff;text-decoration:none;padding:12px 26px;border-radius:8px;font-weight:bold;display:inline-block">Ver e assinar o documento</a>
        </p>
        <p style="margin:0;font-size:12px;color:#5a6b78">Ao assinar, ficam registrados a sua confirmação, a <strong>data/hora</strong> e o <strong>IP</strong> do acesso. ${d.setor ? `Setor: ${d.setor}.` : ""}</p>
      </div>
    </div>`;
    const r = await sendEmail({ to: d.email, subject: titulo, html, attachments: [{ filename: `${titulo}.pdf`, content: pdfB64 }], replyTo: user.email || undefined }).catch(() => ({ ok: false }));
    if (r?.ok) enviados++;
  }

  return NextResponse.json({ ok: true, envioId: envio.id, total: dest.length, enviados });
}
