// Builder do e-mail de alerta de vencimentos da Qualidade (HTML + texto).
// Puro (sem prisma/segredos) — usado pelo cron e pelo botão de teste, e
// importável em scripts de prévia. Layout table-based + estilos inline
// (compatível com Outlook/Gmail). Recebe docs já com `_st` {key,label,dias}.
import { escapeHtml } from "./html";
import { CATEGORIA_LABEL } from "./qualidade-status";

const PORTAL = "https://workspace.torg.com.br/qualidade";
const NAVY = "#0d1f3c";
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");

function linhasHtml(docs, cor, corBg) {
  return docs.map((d, i) => {
    const bg = i % 2 ? "#fafbfc" : "#ffffff";
    return `<tr style="background:${bg};">
        <td style="padding:9px 12px;border-bottom:1px solid #eef0f3;"><div style="font-size:13px;font-weight:bold;color:#002945;">${escapeHtml(d.nome)}</div><div style="font-size:11px;color:#8a97a3;">${escapeHtml(d.tipo || "—")}</div></td>
        <td style="padding:9px 12px;border-bottom:1px solid #eef0f3;font-size:12px;color:#576D7E;">${escapeHtml(CATEGORIA_LABEL[d.categoria] || d.categoria)}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #eef0f3;font-size:12px;color:#576D7E;white-space:nowrap;">${fmtData(d.dataValidade)}</td>
        <td align="right" style="padding:9px 12px;border-bottom:1px solid #eef0f3;white-space:nowrap;"><span style="display:inline-block;background:${corBg};color:${cor};font-size:11px;font-weight:bold;padding:3px 10px;border-radius:20px;">${escapeHtml(d._st.label)}</span></td>
      </tr>`;
  }).join("");
}

function tabelaHtml(titulo, cor, corBg, docs) {
  if (!docs.length) return "";
  return `<div style="font-size:14px;font-weight:bold;color:${cor};margin:2px 0 7px;">${escapeHtml(titulo)} <span style="color:#b8c0c8;font-weight:normal;font-size:12px;">(${docs.length})</span></div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;border-spacing:0;border:1px solid #e6eaef;border-radius:8px;overflow:hidden;">
        <tr style="background:${NAVY};">
          <th align="left" style="padding:8px 12px;font-size:10.5px;color:#cfe0f5;text-transform:uppercase;letter-spacing:0.4px;font-weight:bold;">Documento</th>
          <th align="left" style="padding:8px 12px;font-size:10.5px;color:#cfe0f5;text-transform:uppercase;letter-spacing:0.4px;font-weight:bold;">Categoria</th>
          <th align="left" style="padding:8px 12px;font-size:10.5px;color:#cfe0f5;text-transform:uppercase;letter-spacing:0.4px;font-weight:bold;">Validade</th>
          <th align="right" style="padding:8px 12px;font-size:10.5px;color:#cfe0f5;text-transform:uppercase;letter-spacing:0.4px;font-weight:bold;">Situação</th>
        </tr>
        ${linhasHtml(docs, cor, corBg)}
      </table>`;
}

function kpiHtml(valor, label, cor, corBg, corBorda) {
  return `<td width="50%" valign="top" style="padding:5px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${corBg};border:1px solid ${corBorda};border-radius:10px;">
          <tr><td style="padding:14px 16px;">
            <div style="font-size:30px;font-weight:bold;color:${cor};line-height:1;">${valor}</div>
            <div style="font-size:11px;color:${cor};margin-top:5px;text-transform:uppercase;letter-spacing:0.6px;font-weight:bold;">${escapeHtml(label)}</div>
          </td></tr>
        </table>
      </td>`;
}

/**
 * Monta { subject, html, text } do alerta de vencimentos.
 * @param {Array} vencidos - docs VENCIDO (com _st {key,label,dias})
 * @param {Array} vencendo - docs VENCENDO
 * @param {{ teste?: boolean, dataHoje?: string }} opts
 */
export function montarEmailVencidos(vencidos, vencendo, { teste = false, dataHoje } = {}) {
  const hoje = dataHoje || new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const vazio = !vencidos.length && !vencendo.length;
  const subject = `${teste ? "[TESTE] " : ""}[Qualidade] ${vencidos.length} documento(s) vencido(s) · ${vencendo.length} a vencer`;

  const html = `<div style="background:#eef1f5;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" align="center" width="640" cellpadding="0" cellspacing="0" style="width:640px;max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e3e8ee;">
      <tr><td style="background:${NAVY};padding:22px 28px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="font-size:20px;font-weight:bold;color:#ffffff;letter-spacing:0.5px;">TORG&nbsp;METAL</td>
          <td align="right" style="font-size:10.5px;color:#9fb4d4;text-transform:uppercase;letter-spacing:1px;">Qualidade · Vencimentos</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:24px 28px 6px;">
        <div style="font-size:20px;font-weight:bold;color:#002945;">Alerta de vencimentos</div>
        <div style="font-size:12.5px;color:#6b7a86;margin-top:3px;">Documentos vencidos e a vencer nos próximos 30 dias · ${hoje}</div>
      </td></tr>
      <tr><td style="padding:10px 23px 4px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          ${kpiHtml(vencidos.length, "Vencidos", "#c0392b", "#fdecea", "#f4c7c0")}
          ${kpiHtml(vencendo.length, "A vencer (30 dias)", "#b9770e", "#fdf4e3", "#f0dcb0")}
        </tr></table>
      </td></tr>
      ${vencidos.length ? `<tr><td style="padding:6px 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff6f5;border-left:4px solid #c0392b;border-radius:6px;"><tr><td style="padding:11px 14px;font-size:12.5px;color:#7a2018;"><strong>Atenção:</strong> ${vencidos.length} documento(s) vencido(s) precisam de renovação.</td></tr></table></td></tr>` : ""}
      ${vazio ? `<tr><td style="padding:24px 28px;text-align:center;color:#0a7d33;font-size:14px;font-weight:bold;">✓ Nenhum documento vencido ou a vencer no momento.</td></tr>` : ""}
      ${vencidos.length ? `<tr><td style="padding:14px 28px 2px;">${tabelaHtml("Vencidos", "#c0392b", "#fdecea", vencidos)}</td></tr>` : ""}
      ${vencendo.length ? `<tr><td style="padding:12px 28px 2px;">${tabelaHtml("A vencer (até 30 dias)", "#b9770e", "#fdf4e3", vencendo)}</td></tr>` : ""}
      <tr><td align="center" style="padding:22px 28px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr><td style="background:#006EAB;border-radius:8px;">
          <a href="${PORTAL}" style="display:inline-block;padding:13px 28px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;">Abrir o Controle de Documentos &rarr;</a>
        </td></tr></table>
      </td></tr>
      <tr><td style="background:#f7f9fb;border-top:1px solid #e6eaef;padding:16px 28px;">
        <div style="font-size:10.5px;color:#8a97a3;line-height:1.6;">Torg Metal · Resumo automático da Qualidade (PQ-00 / NBR 16775) · gerado em ${hoje}.<br>Você recebe este e-mail porque está cadastrado nos alertas de vencimento da Qualidade.</div>
      </td></tr>
    </table>
  </div>`;

  const linhaTxt = (d) => `- ${d.nome} (${CATEGORIA_LABEL[d.categoria] || d.categoria}) — ${d._st.label}, validade ${fmtData(d.dataValidade)}`;
  const text = [
    "TORG METAL — Qualidade · Alerta de vencimentos", hoje, "",
    `VENCIDOS (${vencidos.length}):`, ...(vencidos.length ? vencidos.map(linhaTxt) : ["(nenhum)"]), "",
    `A VENCER — 30 dias (${vencendo.length}):`, ...(vencendo.length ? vencendo.map(linhaTxt) : ["(nenhum)"]), "",
    PORTAL,
  ].join("\n");

  return { subject, html, text };
}
