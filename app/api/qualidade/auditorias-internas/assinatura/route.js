// Envio do Cronograma de Auditoria Interna p/ assinatura dos setores (e-mail + link por token).
// GET lista os envios/assinaturas · POST cria um envio (snapshot + revisão) e dispara os e-mails.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { gerarTokenForte } from "@/lib/token";
import { getRevisao, bumpRevisao, fmtRev } from "@/lib/assinatura-doc";
import { diffCronograma, auditoriasDoSnapshot } from "@/lib/cronograma-auditoria-revisoes";
import { gerarCronogramaAuditoriaPDF } from "@/lib/cronograma-auditoria-pdf";
import { sendEmail } from "@/lib/email";
import { cabecalhoEmail } from "@/lib/email-layout";
import { baseUrlDe } from "@/lib/databook-assinaturas";
import { arquivarForm, pastaDe } from "@/lib/arquivar-form";
import { log } from "@/lib/log";

const registro = log("api/qualidade/auditorias-internas/assinatura");

export const runtime = "nodejs";
export const maxDuration = 60;
const TIPO = "CRONOGRAMA_AUDITORIA";

export async function GET() {
  try { await requireRole(["ADMIN", "QUALIDADE"]); }
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
  try { user = await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const body = await req.json().catch(() => ({}));
  const dest = Array.isArray(body?.destinatarios)
    ? body.destinatarios.map((d) => ({ nome: String(d?.nome || "").trim(), email: String(d?.email || "").trim(), setor: String(d?.setor || "").trim() || null })).filter((d) => d.nome && /.+@.+\..+/.test(d.email))
    : [];
  if (!dest.length) return NextResponse.json({ error: "Informe ao menos um destinatário (nome + e-mail válido)." }, { status: 400 });

  const auditorias = await prisma.auditoriaInterna.findMany({
    orderBy: { dataAuditoria: "asc" },
    select: { numero: true, setor: true, dataAuditoria: true, responsavelAcompanhamento: true, status: true, escopo: true },
    take: 500,
  });
  // ⚠⚠ A REVISÃO SOBE AQUI E SÓ AQUI. Mexer no cronograma não é revisão — é rascunho (Vitor,
  // 27/08/2026: "somente subir revisão no caso de enviar para assinatura"). E reenviar o MESMO
  // cronograma (para incluir um destinatário, por exemplo) também não é revisão nova: só sobe
  // quando o conteúdo mudou em relação ao último envio.
  const ultimo = await prisma.envioAssinatura.findFirst({
    where: { tipo: TIPO }, orderBy: { enviadoEm: "desc" }, select: { revisao: true, snapshot: true },
  });
  const mudou = ultimo ? diffCronograma(auditoriasDoSnapshot(ultimo), auditorias).total > 0 : false;
  const revisao = mudou ? await bumpRevisao(TIPO) : await getRevisao(TIPO);
  const ano = auditorias[0]?.dataAuditoria ? new Date(auditorias[0].dataAuditoria).getUTCFullYear() : new Date().getUTCFullYear();
  const titulo = `Cronograma de Auditoria Interna ${ano} — ${fmtRev(revisao)}`;

  const envio = await prisma.envioAssinatura.create({
    data: { tipo: TIPO, revisao, titulo, snapshot: { ano, revisao, auditorias }, enviadoPorId: user.id || null },
  });

  const pdfBytes = await gerarCronogramaAuditoriaPDF({ ano, revisao, auditorias });
  const pdfB64 = Buffer.from(pdfBytes).toString("base64");

  // ⚠ ARQUIVA A REVISÃO QUE FOI ENVIADA PARA ASSINATURA — é este o documento que os setores
  // validaram. O nome carrega a revisão para que R00 e R01 convivam na pasta: aqui a versão
  // anterior NÃO deve ser substituída, porque cada uma tem assinaturas próprias.
  const arq = await arquivarForm({
    pasta: pastaDe("AUDITORIA_INTERNA", { ano }),
    nomeArquivo: `Cronograma de Auditoria Interna ${ano} ${fmtRev(revisao)}.pdf`,
    bytes: pdfBytes,
  });
  if (!arq.ok) registro.erro("[cronograma-auditoria] arquivamento:", arq.erro);
  const base = baseUrlDe(req);
  let enviados = 0;

  for (const d of dest) {
    const token = gerarTokenForte(24);
    await prisma.assinaturaDocumento.create({ data: { envioId: envio.id, nome: d.nome, email: d.email, setor: d.setor, token } });
    const link = `${base}/assinar/${token}`;
    const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0D1F3C">
      ${cabecalhoEmail("Assinatura — Cronograma de Auditoria Interna")}
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
