// RNCs aguardam 60 dias corridos desde a emissão para avaliar reincidência.
// O aviso é registrado na auditoria por RNC/emissão e não se repete diariamente.
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { temCronSecret } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { aquecerBanco } from "@/lib/db-retry";
import { registrarExecucao } from "@/lib/cron-monitor";
import { comTravaDeCron } from "@/lib/cron-trava";
import { sendEmail } from "@/lib/email";
import { cabecalhoEmail, escaparHtml } from "@/lib/email-layout";
import { requireRole } from "@/lib/session";
import { acompanhamentoEficacia, numRNC } from "@/lib/nao-conformidade";
export const runtime = "nodejs";
export const maxDuration = 60;
const ABERTAS = ["ABERTA", "EM_ACAO", "RESPONDIDA"];
const ACAO_AVISO = "RNC_AVALIACAO_EFICACIA_AVISADA";
const ACAO_ENVIO = "RNC_AVALIACAO_EFICACIA_ENVIO";
const fmtD = (iso) => iso.split("-").reverse().join("/");
async function destinatarios() {
  const env = (process.env.QUALIDADE_ALERTA_EMAILS || "").split(",").map((s) => s.trim()).filter(Boolean);
  let db = [];
  try {
    const insc = await prisma.emailNotificacao.findMany({
      where: { ativo: true, eventos: { has: "QUALIDADE_VENCIDOS" } },
      select: { email: true },
    });
    db = insc.map((i) => i.email).filter(Boolean);
  } catch { /* sem inscritos no banco não é fatal */ }
  return [...new Set([...db, ...env])];
}

export async function GET(req) {
  const isCron = temCronSecret(req);
  if (!isCron) {
    try { await requireRole(["ADMIN"]); }
    catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  }
  const t0 = Date.now();
  try {
    await aquecerBanco(prisma);
    const executar = async () => {
      const rncs = await prisma.naoConformidade.findMany({
        where: { status: { in: ABERTAS }, encerradaEm: null },
        select: { id: true, numero: true, ano: true, data: true, opNumero: true,
          descricao: true, status: true, encerradaEm: true },
        orderBy: [{ data: "asc" }, { id: "asc" }],
      });
      const abertas = rncs.map(r => ({ ...r, avaliacao: acompanhamentoEficacia(r) }))
        .filter(r => r.avaliacao);
      const aguardando = abertas.filter(r => r.avaliacao.fase === "AGUARDANDO_EFICACIA").length;
      const vencidas = abertas.filter(r => r.avaliacao.fase === "AVALIAR_EFICACIA");
      const avisos = vencidas.length ? await prisma.auditLog.findMany({
        where: { action: ACAO_AVISO, entity: "NaoConformidade", entityId: { in: vencidas.map(r => r.id) } },
        select: { entityId: true, diff: true },
      }) : [];
      const avisadas = new Set(avisos.map(a => `${a.entityId}:${a.diff?.emissao}`));
      const pendentes = vencidas.filter(r => !avisadas.has(`${r.id}:${r.avaliacao.emissao}`));
      const resumo = { aguardando, pendentes: pendentes.length, avisadas: 0, enviado: false };
      // A prévia nunca envia mensagens nem consome o aviso da equipe.
      if (!isCron) return { ok: true, modo: "previa", ...resumo,
        rncs: pendentes.map(r => ({ id: r.id, numero: numRNC(r.numero, r.ano), avaliarEm: r.avaliacao.avaliarEm })) };
      let lote = await prisma.auditLog.findFirst({
        where: { action: ACAO_ENVIO, entity: "Cron", entityId: "rnc-abertas", OR: [
          { diff: { path: ["estado"], equals: "PENDENTE" } },
          { diff: { path: ["estado"], equals: "REJEITADO" } },
        ] }, orderBy: { createdAt: "asc" },
      });
      const tentativaAnteriorIncerta = lote?.diff.estado === "PENDENTE";
      if (!lote && !pendentes.length) return { ok: true, ...resumo };
      // O provedor deduplica por 24h. Depois disso, um envio sem confirmação
      // precisa de conferência no provedor; reenviar às cegas pode duplicá-lo.
      if (lote?.diff.estado === "PENDENTE" && Date.now() - new Date(lote.diff.tentadoEm).getTime() >= 86400000) {
        return { ok: false, ...resumo, error: "Envio de avaliação com confirmação pendente há 24h: conferir no provedor antes de reenviar." };
      }
      if (!lote) {
        const to = await destinatarios();
        if (!to.length) return { ok: true, ...resumo, motivo: "sem destinatários" };
        const base = process.env.NEXT_PUBLIC_BASE_URL || "https://workspace.torg.com.br";
        const linhas = pendentes.map(r => `<tr>
          <td style="padding:8px"><a href="${escaparHtml(base)}/qualidade/rnc/${encodeURIComponent(r.id)}">${numRNC(r.numero,r.ano)}</a></td>
          <td style="padding:8px">${escaparHtml(r.opNumero || "—")}</td>
          <td style="padding:8px">${escaparHtml((r.descricao || "sem descrição").slice(0,90))}</td>
          <td style="padding:8px">${fmtD(r.avaliacao.emissao)}</td>
          <td style="padding:8px">${fmtD(r.avaliacao.avaliarEm)}</td>
        </tr>`).join("");
        const subject = `${pendentes.length} RNC(s): avaliar eficácia após 60 dias`;
        const html = `<div style="font-family:Arial,sans-serif;max-width:760px;margin:auto">
          ${cabecalhoEmail("RNCs — avaliação da eficácia")}
          <p>As RNCs abaixo completaram <strong>60 dias corridos desde a emissão</strong>.
          Avalie se houve reincidência, registre a eficácia das ações e decida o encerramento.</p>
          <p>Este é um aviso único por RNC. O encerramento depende da avaliação da Qualidade.</p>
          <table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr>
          <th>RNC</th><th>OP</th><th>Descrição</th><th>Emissão</th><th>Avaliar a partir de</th>
          </tr></thead><tbody>${linhas}</tbody></table></div>`;
        const idempotencyKey = `rnc-eficacia-${createHash("sha256").update(JSON.stringify({
          to: [...to].sort(), rncs: pendentes.map(r => [r.id,r.avaliacao.emissao]),
        })).digest("hex")}`;
        // O lote e o conteúdo são duráveis ANTES da chamada externa. Uma retomada
        // usa exatamente os mesmos destinatários, membros, texto e chave.
        lote = await prisma.auditLog.create({ data: {
          action: ACAO_ENVIO, entity: "Cron", entityId: "rnc-abertas",
          diff: { estado: "PENDENTE", tentadoEm: new Date().toISOString(), idempotencyKey,
            mensagem: { to, subject, html,
              text: `${pendentes.map(r=>numRNC(r.numero,r.ano)).join(", ")}: prazo de 60 dias desde a emissão concluído. Avalie reincidência e eficácia antes de encerrar. ${base}/qualidade/rnc` },
            membros: pendentes.map(r => ({ id: r.id, emissao: r.avaliacao.emissao, avaliarEm: r.avaliacao.avaliarEm })),
          },
        } });
      } else if (lote.diff.estado === "REJEITADO") {
        lote = await prisma.auditLog.update({ where: { id: lote.id }, data: {
          diff: { ...lote.diff, estado: "PENDENTE", tentadoEm: new Date().toISOString() },
        } });
      }
      const envio = await sendEmail({ ...lote.diff.mensagem, idempotencyKey: lote.diff.idempotencyKey });
      if (!envio.ok) {
        await prisma.auditLog.update({ where: { id: lote.id }, data: {
          diff: { ...lote.diff, estado: envio.indeterminado || tentativaAnteriorIncerta ? "PENDENTE" : "REJEITADO", erro: envio.error || "Falha de envio" },
        } });
        return { ok: false, ...resumo, error: envio.error };
      }
      // Marcadores e confirmação do lote são atômicos. Se o banco falhar, o lote
      // pendente continua recuperável, sem misturar RNCs novas na mesma tentativa.
      await prisma.$transaction(async tx => {
        await tx.auditLog.createMany({ data: lote.diff.membros.map(r => ({
          action: ACAO_AVISO, entity: "NaoConformidade", entityId: r.id,
          diff: { emissao: r.emissao, avaliarEm: r.avaliarEm, emailId: envio.id || null },
        })) });
        await tx.auditLog.update({ where: { id: lote.id }, data: {
          diff: { ...lote.diff, estado: "CONFIRMADO", emailId: envio.id || null },
        } });
      });
      return { ok: true, modo: "agendado", ...resumo, avisadas: lote.diff.membros.length, enviado: true };
    };
    const resultado = isCron ? await comTravaDeCron(prisma, "rnc-abertas", executar) : await executar();
    if (resultado === null) return NextResponse.json({ ok: true, enviado: false, motivo: "em execução" });
    await registrarExecucao("rnc-abertas", { ok: resultado.ok, mensagem: resultado.error || `${resultado.aguardando} aguardando; ${resultado.avisadas} avisada(s)`, duracaoMs: Date.now() - t0 });
    return NextResponse.json(resultado);
  } catch (e) {
    await registrarExecucao("rnc-abertas", { ok: false, mensagem: e.message, duracaoMs: Date.now() - t0 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
