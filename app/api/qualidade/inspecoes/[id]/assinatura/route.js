// POST — envia o relatório de inspeção para assinatura (e-mail + link por token).
//
// Vitor (21/08/2026): "esses relatórios precisam de assinaturas, que seria enviado através do
// computador posteriormente... nós vamos assinar, o inspetor e o cliente".
//
// Reusa o fluxo genérico que já valida Plano de Treinamentos e Cronograma de Auditoria:
// EnvioAssinatura + AssinaturaDocumento + página /assinar/[token], com confirmação, data/hora e IP.
//
// ⚠ É assinatura ELETRÔNICA, não certificado ICP-Brasil. O que prova autoria é o conjunto: link
// único por pessoa, confirmação registrada, data/hora e IP. O documento diz isso no rodapé — vender
// como ICP-Brasil o que não é seria pior que não ter assinatura nenhuma.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { gerarTokenForte } from "@/lib/token";
import { gerarRelatorioInspecaoPDF } from "@/lib/relatorio-inspecao-pdf";
import { vincularNoDataBook } from "@/lib/relatorio-inspecao";
import { TIPO_LABEL } from "@/lib/qualidade-campo";
import { sendEmail } from "@/lib/email";
import { cabecalhoEmail } from "@/lib/email-layout";
import { baseUrlDe } from "@/lib/databook-assinaturas";

export const runtime = "nodejs";
export const maxDuration = 60;

const TIPO_ENVIO = "RELATORIO_INSPECAO";
const PERFIS = ["ADMIN", "QUALIDADE"];

export async function POST(req, { params }) {
  let user;
  try { user = await requireRole(PERFIS); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { id } = await params;
  const rel = await prisma.relatorioInspecao.findUnique({ where: { id } });
  if (!rel) return NextResponse.json({ error: "Relatório não encontrado" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const dest = Array.isArray(body?.destinatarios)
    ? body.destinatarios
        .map((d) => ({
          nome: String(d?.nome || "").trim(),
          email: String(d?.email || "").trim(),
          setor: String(d?.papel || d?.setor || "").trim() || null,
        }))
        .filter((d) => d.nome && /.+@.+\..+/.test(d.email))
    : [];
  if (!dest.length) return NextResponse.json({ error: "Informe ao menos um assinante (nome + e-mail válido)." }, { status: 400 });

  // ⚠ Reenviar não recomeça: se já existe envio, o link de quem ainda não assinou continua valendo
  // e só entram os destinatários novos. Recriar o envio invalidaria assinatura já colhida.
  let envioId = rel.envioAssinaturaId;
  const fotos = await prisma.fotoInspecao.findMany({
    where: { relatorioId: id },
    orderBy: { capturadaEm: "asc" },
    select: { url: true, marca: true, origemMarca: true, observacao: true, capturadaEm: true, autorNome: true },
  });

  const titulo = `${rel.codigo} — ${TIPO_LABEL[rel.tipo] || "Relatório de inspeção"} · OP-${rel.opNumero}`;

  if (!envioId) {
    const envio = await prisma.envioAssinatura.create({
      data: {
        tipo: TIPO_ENVIO, revisao: 0, titulo,
        snapshot: { relatorioId: rel.id, codigo: rel.codigo, opNumero: rel.opNumero },
        enviadoPorId: user.id || null,
      },
    });
    envioId = envio.id;
    await prisma.relatorioInspecao.update({
      where: { id },
      // emitir é o que fecha o documento: a partir daqui ele foi para assinatura
      data: { envioAssinaturaId: envioId, status: "EMITIDO", emitidoEm: rel.emitidoEm || new Date() },
    });
  }

  const jaTem = await prisma.assinaturaDocumento.findMany({
    where: { envioId },
    select: { email: true },
  });
  const emails = new Set(jaTem.map((a) => a.email.toLowerCase()));

  const pdfB64 = Buffer.from(
    await gerarRelatorioInspecaoPDF({ rel: { ...rel, emitidoEm: rel.emitidoEm || new Date() }, fotos, assinaturas: null }),
  ).toString("base64");
  const base = baseUrlDe(req);

  let enviados = 0, novos = 0;
  for (const d of dest) {
    if (emails.has(d.email.toLowerCase())) continue;
    const token = gerarTokenForte(24);
    await prisma.assinaturaDocumento.create({ data: { envioId, nome: d.nome, email: d.email, setor: d.setor, token } });
    novos++;
    const link = `${base}/assinar/${token}`;
    const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0D1F3C">
      ${cabecalhoEmail("Assinatura — Relatório de Inspeção")}
      <div style="border:1px solid #e7ecf2;border-top:none;border-radius:0 0 8px 8px;padding:20px 24px">
        <p style="margin:0 0 10px">Olá, <strong>${d.nome}</strong>,</p>
        <p style="margin:0 0 12px">Segue para validação o <strong>${titulo}</strong>, com ${fotos.length} evidência(s) fotográfica(s). O documento está em anexo neste e-mail.</p>
        <p style="text-align:center;margin:22px 0">
          <a href="${link}" style="background:#006EAB;color:#fff;text-decoration:none;padding:12px 26px;border-radius:8px;font-weight:bold;display:inline-block">Ver e assinar o relatório</a>
        </p>
        <p style="margin:0;font-size:12px;color:#5a6b78">Ao assinar, ficam registrados a sua confirmação, a <strong>data/hora</strong> e o <strong>IP</strong> do acesso.${d.setor ? ` Papel: ${d.setor}.` : ""}</p>
      </div>
    </div>`;
    const r = await sendEmail({
      to: d.email, subject: titulo, html,
      attachments: [{ filename: `${rel.codigo}.pdf`, content: pdfB64 }],
      replyTo: user.email || undefined,
    }).catch(() => ({ ok: false }));
    if (r?.ok) enviados++;
  }

  // o documento na seção do data book passa a apontar pro PDF do relatório
  const atualizado = await prisma.relatorioInspecao.findUnique({ where: { id } });
  const vinculo = await vincularNoDataBook(atualizado, `${base}/api/qualidade/inspecoes/${id}/pdf`);

  await prisma.auditLog.create({
    data: {
      userId: user.id, action: "ENVIAR_RELATORIO_INSPECAO_ASSINATURA", entity: "RelatorioInspecao", entityId: id,
      diff: { codigo: rel.codigo, destinatarios: dest.length, novos, enviados, vinculo },
    },
  }).catch(() => {});

  return NextResponse.json({ ok: true, envioId, novos, enviados, jaEstavam: dest.length - novos, vinculo });
}
