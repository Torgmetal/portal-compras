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
import { gerarPDFdoRelatorio } from "@/lib/relatorio-render";
import { vincularNoDataBook } from "@/lib/relatorio-inspecao";
import { TIPO_LABEL, pendenciasParaAssinatura } from "@/lib/qualidade-campo";
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
          // ⚠ NEM TODO DESTINATÁRIO ASSINA. Vitor (22/08/2026): "deixar uma caixa para selecionar
          // quais pessoas que estamos enviando vai assinar ou não, pois podemos apenas colocar
          // pessoas em cópia". Quem vai em cópia recebe o documento e NÃO ganha link nem linha no
          // quadro de assinaturas — senão o relatório fica eternamente "aguardando" alguém que
          // nunca deveria assinar.
          assina: d?.assina !== false,
        }))
        .filter((d) => d.nome && /.+@.+\..+/.test(d.email))
    : [];
  if (!dest.length) return NextResponse.json({ error: "Informe ao menos um destinatário (nome + e-mail válido)." }, { status: 400 });
  const assinantes = dest.filter((d) => d.assina);
  const copias = dest.filter((d) => !d.assina);
  if (!assinantes.length) return NextResponse.json({ error: "Marque ao menos uma pessoa como ASSINANTE — só com cópias o documento nunca é assinado." }, { status: 400 });

  // ⚠⚠ NÃO MANDA ASSINAR RELATÓRIO PELA METADE. Vitor (03/09/2026): "para os relatórios que não
  // estiverem definidas todas as medidas mencionadas para conferência e o quantitativo você precisa
  // bloquear para envio de assinatura".
  //
  // Enviar é FECHAR: o relatório vira somente leitura e entra no data book. Com a coluna "Dimensão
  // Encontrada" em branco, o que se pede é que alguém assine uma conferência que não foi feita.
  //
  // ⚠ A trava é no SERVIDOR, não só no botão: o mesmo POST é alcançável por outro caminho, e uma
  // regra que só existe na tela é uma regra que um dia não vale.
  //
  // ⚠ Só barra no PRIMEIRO envio (`!rel.envioAssinaturaId`). Reenviar para quem ainda não assinou é
  // outro ato — ali o documento já está fechado e não há mais o que preencher.
  if (!rel.envioAssinaturaId) {
    const faltam = pendenciasParaAssinatura(rel);
    if (faltam.length) {
      return NextResponse.json({
        error: `O relatório ainda não pode ir para assinatura:\n\n• ${faltam.join("\n• ")}`,
        pendencias: faltam,
      }, { status: 409 });
    }
  }

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

  // ⚠ O ANEXO É O DOCUMENTO DE VERDADE. Aqui também estava o gerador antigo, que não conhece os
  // modelos novos — quem recebia o e-mail lia uma folha que não é o relatório. Mesmo despacho da
  // tela e do link (lib/relatorio-render.js).
  const opDados = await prisma.oP.findFirst({
    where: { numero: rel.opNumero }, select: { cliente: true, obra: true, refCliente: true },
  });
  const pdfB64 = Buffer.from(
    await gerarPDFdoRelatorio({
      rel: { ...rel, emitidoEm: rel.emitidoEm || new Date() },
      fotos, assinaturas: null,
      cliente: opDados?.cliente || null, obra: opDados?.obra || null, refCliente: opDados?.refCliente || null,
    }),
  ).toString("base64");
  const base = baseUrlDe(req);

  let enviados = 0, novos = 0;
  for (const d of assinantes) {
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

  // ── CÓPIAS: recebem o documento, sem link e sem linha no quadro de assinaturas ──
  let emCopia = 0;
  for (const c of copias) {
    const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0D1F3C">
      ${cabecalhoEmail("Relatório de Inspeção — cópia")}
      <div style="border:1px solid #e7ecf2;border-top:none;border-radius:0 0 8px 8px;padding:20px 24px">
        <p style="margin:0 0 10px">Olá, <strong>${c.nome}</strong>,</p>
        <p style="margin:0 0 12px">Segue, <strong>para conhecimento</strong>, o <strong>${titulo}</strong>, com ${fotos.length} evidência(s) fotográfica(s). O documento está em anexo.</p>
        <p style="margin:0;color:#5b6b7a;font-size:13px">Você está em cópia: não é necessário assinar.</p>
      </div>
    </div>`;
    const r = await sendEmail({
      to: c.email, subject: `${titulo} (cópia)`, html,
      attachments: [{ filename: `${rel.codigo}.pdf`, content: pdfB64 }],
      replyTo: user.email || undefined,
    }).catch(() => ({ ok: false }));
    if (r?.ok) emCopia++;
  }

  // o documento na seção do data book passa a apontar pro PDF do relatório
  const atualizado = await prisma.relatorioInspecao.findUnique({ where: { id } });
  const vinculo = await vincularNoDataBook(atualizado, `${base}/api/qualidade/inspecoes/${id}/pdf`);

  await prisma.auditLog.create({
    data: {
      userId: user.id, action: "ENVIAR_RELATORIO_INSPECAO_ASSINATURA", entity: "RelatorioInspecao", entityId: id,
      diff: { codigo: rel.codigo, destinatarios: dest.length, assinantes: assinantes.length, copias: copias.length, novos, enviados, emCopia, vinculo },
    },
  }).catch(() => {});

  return NextResponse.json({ ok: true, envioId, novos, enviados, emCopia, jaEstavam: assinantes.length - novos, vinculo });
}
