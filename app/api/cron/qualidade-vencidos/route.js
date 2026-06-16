// Cron Vercel — alerta de documentos da Qualidade vencidos / a vencer.
// Roda segunda de manhã (vercel.json). Manda e-mail pro endereço FIXO da Qualidade
// (env QUALIDADE_ALERTA_EMAILS, separado por vírgula). Não envia se não houver nada.
// Autenticação igual aos outros crons (user-agent vercel-cron OU Bearer CRON_SECRET).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/html";
import { calcStatusValidade, diasAlertaCategoria, CATEGORIA_LABEL } from "@/lib/qualidade-status";

export const runtime = "nodejs";
export const maxDuration = 60;

const PORTAL = "https://workspace.torg.com.br/qualidade";
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");

function destinatarios() {
  return (process.env.QUALIDADE_ALERTA_EMAILS || "").split(",").map((s) => s.trim()).filter(Boolean);
}

function linhasHtml(docs) {
  return docs
    .map((d) => {
      const cor = d._st.key === "VENCIDO" ? "#c0392b" : "#b9770e";
      return `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eef0f3;"><strong style="color:#002945;">${escapeHtml(d.nome)}</strong><div style="color:#6b7a86;font-size:12px;">${escapeHtml(d.tipo || "—")}</div></td>
        <td style="padding:6px 10px;border-bottom:1px solid #eef0f3;color:#576D7E;">${escapeHtml(CATEGORIA_LABEL[d.categoria] || d.categoria)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eef0f3;white-space:nowrap;color:#576D7E;">${fmtData(d.dataValidade)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eef0f3;white-space:nowrap;color:${cor};font-weight:600;">${escapeHtml(d._st.label)}</td>
      </tr>`;
    })
    .join("");
}

function tabelaHtml(titulo, cor, docs) {
  if (!docs.length) return "";
  return `<h3 style="color:${cor};margin:18px 0 6px;font-size:15px;">${escapeHtml(titulo)} (${docs.length})</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr style="background:#0d1f3c;color:#fff;text-align:left;">
        <th style="padding:6px 10px;">Documento</th><th style="padding:6px 10px;">Categoria</th>
        <th style="padding:6px 10px;">Validade</th><th style="padding:6px 10px;">Situação</th>
      </tr></thead><tbody>${linhasHtml(docs)}</tbody></table>`;
}

export async function GET(req) {
  const auth = req.headers.get("authorization") || "";
  const ua = req.headers.get("user-agent") || "";
  const isCron = ua.includes("vercel-cron") || auth === `Bearer ${process.env.CRON_SECRET}`;
  if (!isCron && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const to = destinatarios();
  if (!to.length) {
    console.warn("[cron qualidade-vencidos] QUALIDADE_ALERTA_EMAILS não configurado — pulando");
    return NextResponse.json({ ok: true, skipped: true, motivo: "QUALIDADE_ALERTA_EMAILS não configurado" });
  }

  const docs = await prisma.documentoQualidade.findMany({
    where: { ativo: true, dataValidade: { not: null } },
    select: { nome: true, tipo: true, categoria: true, dataValidade: true },
  });
  const vencidos = [], vencendo = [];
  for (const d of docs) {
    d._st = calcStatusValidade(d.dataValidade, diasAlertaCategoria(d.categoria));
    if (d._st.key === "VENCIDO") vencidos.push(d);
    else if (d._st.key === "VENCENDO") vencendo.push(d);
  }
  if (!vencidos.length && !vencendo.length) {
    return NextResponse.json({ ok: true, skipped: true, motivo: "nada vencido / a vencer" });
  }
  vencidos.sort((a, b) => a._st.dias - b._st.dias); // mais vencido primeiro
  vencendo.sort((a, b) => a._st.dias - b._st.dias); // vence antes primeiro

  const subject = `[Qualidade] ${vencidos.length} documento(s) vencido(s) · ${vencendo.length} a vencer`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#002945;max-width:720px;">
      <h2 style="color:#006EAB;margin:0 0 4px;">Documentos da Qualidade — vencimentos</h2>
      <p style="color:#576D7E;font-size:13px;margin:0 0 8px;">Resumo automático. Renove os documentos abaixo no Controle de Documentos.</p>
      ${tabelaHtml("Vencidos", "#c0392b", vencidos)}
      ${tabelaHtml("A vencer (até 30 dias)", "#b9770e", vencendo)}
      <p style="margin-top:18px;"><a href="${PORTAL}" style="background:#006EAB;color:#fff;padding:8px 14px;border-radius:8px;text-decoration:none;font-size:13px;">Abrir o Controle de Documentos</a></p>
    </div>`;
  const linhaTxt = (d) => `- ${d.nome} (${CATEGORIA_LABEL[d.categoria] || d.categoria}) — ${d._st.label}, validade ${fmtData(d.dataValidade)}`;
  const text = [
    "Documentos da Qualidade — vencimentos", "",
    `VENCIDOS (${vencidos.length}):`, ...vencidos.map(linhaTxt), "",
    `A VENCER (${vencendo.length}):`, ...vencendo.map(linhaTxt), "", PORTAL,
  ].join("\n");

  const res = await sendEmail({ to, subject, html, text });
  return NextResponse.json({ ok: res.ok, vencidos: vencidos.length, vencendo: vencendo.length, enviado: res.ok, error: res.error });
}
