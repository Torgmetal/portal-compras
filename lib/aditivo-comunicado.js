// ─── COMUNICADO DE ADITIVO AOS SETORES ────────────────────────────────────────
// Vitor (16/09/2026): "um aviso para os setores sobre esses aditivos". Mesmo desenho do Kick Off:
// PDF padrão Torg + e-mail com botão de aceite por token + cobrança no painel de aceites.
//
// ⚠ SEM VALORES EM R$. É o comunicado de PRODUÇÃO (Engenharia, PCP, Produção, Qualidade,
// Expedição, Compras): o que entrou, com que pedido, TAGs, prazo e o que cada setor precisa fazer.
// Quem precisa do valor vê na OP.
import "server-only";
import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { prisma } from "./prisma";
import { blindarPdf, winAnsi } from "./pdf-winansi";
import { agruparReferencias } from "./referencias-cliente";
import { cabecalhoEmail, escaparHtml } from "./email-layout";
import { urlBase } from "./kickoff-email";

const A4 = [595.28, 841.89];
const M = 42;
const NAVY = rgb(13 / 255, 31 / 255, 60 / 255);
const ORANGE = rgb(244 / 255, 128 / 255, 31 / 255);
const DARK = rgb(0, 38 / 255, 63 / 255);
const GRAY = rgb(0.36, 0.45, 0.52);
const LINE = rgb(0.886, 0.914, 0.941);
const SOFT = rgb(0.961, 0.973, 0.984);
const WHITE = rgb(1, 1, 1);

const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : null);
const fmtDH = (d) => (d ? new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : null);

/** O que cada setor faz quando entra um aditivo — texto fixo, revisado com o Vitor. */
export const PROVIDENCIAS = [
  ["Engenharia", "listas (LE/LPC) e desenhos das TAGs novas, na frente certa; GRD do aditivo"],
  ["Planejamento / PCP", "linha do aditivo no cronograma, programação de corte e prioridades"],
  ["Compras", "RM do aditivo pelos itens de verba dele — não pela verba do contrato-base"],
  ["Produção", "apontar as marcas do aditivo na OP; o setor real continua o mesmo"],
  ["Qualidade", "PIT/PLP valem; relatórios e data book cobrem as TAGs novas"],
  ["Expedição", "romaneio e etiquetas identificam o pedido do aditivo"],
  ["Fiscal / Financeiro", "medição e faturamento pelo pedido novo do cliente, não pelo do contrato"],
];

export const SELECT_ADITIVO_COMUNICADO = {
  id: true, numero: true, descricao: true, status: true, valor: true, dataInicio: true, dataFimPrevista: true, orcamentoRef: true,
  divulgadoEm: true, divulgadoPara: true, createdAt: true,
  createdBy: { select: { name: true } },
  itens: { orderBy: { ordem: "asc" }, select: { categoria: true, descricao: true, unidade: true, qtdContratada: true, tipo: true } },
  receitas: { orderBy: { ordem: "asc" }, select: { descricao: true, unidade: true, quantidade: true } },
  referencias: { orderBy: { ordem: "asc" } },
  aceites: { orderBy: { email: "asc" }, select: { id: true, email: true, token: true, enviadoEm: true, aceitoEm: true, cobrancas: true } },
  op: { select: { id: true, numero: true, cliente: true, obra: true, refCliente: true, referencias: { where: { aditivoId: null, papel: "PROJETO" }, orderBy: { ordem: "asc" } } } },
};

/** Tudo de que o comunicado precisa, já agrupado. */
export async function carregarComunicado(aditivoId) {
  const ad = await prisma.aditivo.findUnique({ where: { id: aditivoId }, select: SELECT_ADITIVO_COMUNICADO });
  if (!ad) return null;
  const refs = agruparReferencias(ad.referencias);
  const pedido = refs.pedidos[0] || null;
  const projetos = ad.op.referencias.map((r) => `${r.rotulo} ${r.codigo}`);
  return { ad, refs, pedido, projetos, titulo: `Aditivo ${ad.numero} — OP-${ad.op.numero} · ${ad.op.cliente}${ad.op.obra ? ` · ${ad.op.obra}` : ""}` };
}

// quebra simples por largura, para o pdf-lib
function quebrar(texto, font, size, maxW) {
  const out = [];
  for (const par of String(texto || "").split("\n")) {
    const palavras = par.split(/\s+/).filter(Boolean);
    let linha = "";
    for (const p of palavras) {
      const teste = linha ? `${linha} ${p}` : p;
      if (font.widthOfTextAtSize(winAnsi(teste), size) <= maxW) linha = teste;
      else { if (linha) out.push(linha); linha = p; }
    }
    out.push(linha);
  }
  return out.length ? out : [""];
}

/** O PDF do comunicado (A4, padrão Torg). */
export async function gerarComunicadoAditivoPDF(dados) {
  const { ad, pedido, projetos } = dados;
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  blindarPdf(pdf, [font, bold]);
  let logo = null;
  try { logo = await pdf.embedPng(fs.readFileSync(path.join(process.cwd(), "public", "torg-logo-white.png"))); } catch { /* sem logo */ }

  let page = pdf.addPage(A4);
  const W = A4[0];
  let y = A4[1];
  const novaPagina = () => { page = pdf.addPage(A4); y = A4[1] - M; };
  const garantir = (h) => { if (y - h < M + 30) novaPagina(); };
  const texto = (t, x, size = 10, f = font, cor = DARK) => page.drawText(winAnsi(t), { x, y, size, font: f, color: cor });

  // cabeçalho navy
  page.drawRectangle({ x: 0, y: y - 92, width: W, height: 92, color: NAVY });
  if (logo) { const s = 110 / logo.width; page.drawImage(logo, { x: M, y: y - 62, width: 110, height: logo.height * s }); }
  page.drawText("COMUNICADO DE ADITIVO", { x: M + 130, y: y - 40, size: 18, font: bold, color: WHITE });
  page.drawText(winAnsi(`Aditivo ${ad.numero} · OP-${ad.op.numero} · ${ad.op.cliente}${ad.op.obra ? ` · ${ad.op.obra}` : ""}`), { x: M + 130, y: y - 60, size: 10, font, color: WHITE });
  page.drawText(winAnsi(`Emitido em ${fmtDH(new Date())}${ad.createdBy?.name ? ` · aberto por ${ad.createdBy.name}` : ""}`), { x: M + 130, y: y - 76, size: 8.5, font, color: rgb(0.8, 0.85, 0.92) });
  page.drawRectangle({ x: 0, y: y - 96, width: W, height: 4, color: ORANGE });
  y -= 118;

  const secao = (titulo) => { garantir(30); page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: 18, color: SOFT }); texto(titulo.toUpperCase(), M + 8, 9, bold, NAVY); y -= 24; };
  const par = (t, size = 10, f = font, cor = DARK, x = M + 8) => { for (const l of quebrar(t, f, size, W - 2 * M - 16 - (x - M - 8))) { garantir(size + 5); texto(l, x, size, f, cor); y -= size + 4; } };
  const campo = (rotulo, valor) => { if (!valor) return; garantir(14); texto(`${rotulo}: `, M + 8, 9.5, bold, GRAY); const wr = bold.widthOfTextAtSize(winAnsi(`${rotulo}: `), 9.5); const linhas = quebrar(valor, font, 10, W - 2 * M - 16 - wr); texto(linhas[0], M + 8 + wr, 10); y -= 14; for (const l of linhas.slice(1)) { garantir(14); texto(l, M + 8 + wr, 10); y -= 14; } };

  secao("Identificação");
  campo("Cliente", ad.op.cliente);
  campo("Obra", ad.op.obra);
  if (projetos.length) campo("Projeto do cliente", projetos.join(" · "));
  if (pedido) {
    campo(`${pedido.rotulo} do aditivo`, `${pedido.codigo}${pedido.descricao ? ` — ${pedido.descricao}` : ""}${pedido.data ? ` (${fmtD(pedido.data)})` : ""}${pedido.revisao ? ` rev. ${pedido.revisao}` : ""}`);
    if (pedido.itens.length) campo(pedido.itens[0].rotulo, pedido.itens.map((i) => i.codigo).join(", "));
    if (pedido.tags.length) campo(pedido.tags[0].rotulo, pedido.tags.map((t) => `${t.codigo}${t.frente ? ` (frente ${t.frente})` : ""}`).join(", "));
  } else campo("Pedido do cliente", "não informado — confira com o Comercial");
  campo("Prazo", [ad.dataInicio ? `início ${fmtD(ad.dataInicio)}` : null, ad.dataFimPrevista ? `fim previsto ${fmtD(ad.dataFimPrevista)}` : null].filter(Boolean).join(" · ") || null);
  campo("Orçamento", ad.orcamentoRef);
  y -= 6;

  secao("O que muda");
  par(ad.descricao || "—");
  y -= 6;

  if (ad.itens?.length) {
    secao("Itens de verba do aditivo (sem valores)");
    for (const it of ad.itens) par(`• ${it.descricao}${it.qtdContratada ? ` — ${Number(it.qtdContratada).toLocaleString("pt-BR")} ${it.unidade || ""}` : ""}  [${it.categoria}]`, 9.5);
    y -= 6;
  }
  if (ad.receitas?.length) {
    secao("Linhas de faturamento do aditivo");
    for (const r of ad.receitas) par(`• ${r.descricao}${r.quantidade ? ` — ${Number(r.quantidade).toLocaleString("pt-BR")} ${r.unidade || ""}` : ""}`, 9.5);
    y -= 6;
  }

  secao("Providências por setor");
  for (const [setor, oque] of PROVIDENCIAS) { garantir(16); texto(`${setor}: `, M + 8, 9.5, bold, DARK); const wr = bold.widthOfTextAtSize(winAnsi(`${setor}: `), 9.5); for (const l of quebrar(oque, font, 9.5, W - 2 * M - 16 - wr)) { texto(l, M + 8 + wr, 9.5, font, GRAY); y -= 13; } }
  y -= 8;
  garantir(40);
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: LINE });
  y -= 14;
  par("Confirme o aceite pelo botão do e-mail. O aceite registra que o setor leu e está de acordo com o aditivo; o painel de aceites do Comercial mostra quem falta.", 8.5, font, GRAY);

  // rodapé em todas as páginas
  const pags = pdf.getPages();
  pags.forEach((pg, i) => pg.drawText(winAnsi(`TORG METAL · Comunicado de Aditivo ${ad.numero} · OP-${ad.op.numero} · página ${i + 1}/${pags.length}`), { x: M, y: 22, size: 7.5, font, color: GRAY }));
  return pdf.save();
}

/** O e-mail (com o marcador __ACEITE__ para o bloco do botão de cada pessoa). */
export function montarEmailAditivo({ dados, mensagem = null, userName = null, lembrete = false }) {
  const { ad, pedido, projetos } = dados;
  const esc = escaparHtml;
  const linha = (r, v) => (v ? `<tr><td style="padding:4px 8px 4px 0;color:#576D7E;font-size:13px;white-space:nowrap;vertical-align:top;">${esc(r)}</td><td style="padding:4px 0;color:#002945;font-size:13px;">${esc(v)}</td></tr>` : "");
  const subject = `${lembrete ? "Lembrete — " : ""}Aditivo ${ad.numero} · OP-${ad.op.numero} · ${ad.op.cliente}${ad.op.obra ? ` · ${ad.op.obra}` : ""}`;
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;">
    ${cabecalhoEmail(`Aditivo ${ad.numero} — OP-${ad.op.numero}`, `${ad.op.cliente}${ad.op.obra ? ` · ${ad.op.obra}` : ""}`)}
    <div style="padding:22px 24px;background:#fff;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 12px 12px;">
      ${lembrete ? `<p style="margin:0 0 12px 0;color:#9a3412;font-size:13px;"><b>Seu aceite deste aditivo está pendente.</b></p>` : ""}
      ${mensagem ? `<p style="margin:0 0 14px 0;color:#002945;font-size:14px;white-space:pre-line;">${esc(mensagem)}</p>` : ""}
      <p style="margin:0 0 12px 0;color:#002945;font-size:14px;">${userName ? `${esc(userName)} abriu` : "Foi aberto"} um <b>aditivo</b> na OP-${esc(ad.op.numero)}. Ele entra como um <b>pedido novo do cliente</b>: TAGs, listas, programação, medição e faturamento próprios.</p>
      <table style="border-collapse:collapse;margin:0 0 14px 0;">
        ${linha("Cliente", ad.op.cliente)}${linha("Obra", ad.op.obra)}${linha("Projeto do cliente", projetos.join(" · "))}
        ${pedido ? linha(`${pedido.rotulo} do aditivo`, `${pedido.codigo}${pedido.descricao ? ` — ${pedido.descricao}` : ""}`) : linha("Pedido do cliente", "não informado")}
        ${pedido?.itens?.length ? linha(pedido.itens[0].rotulo, pedido.itens.map((i) => i.codigo).join(", ")) : ""}
        ${pedido?.tags?.length ? linha(pedido.tags[0].rotulo, pedido.tags.map((t) => t.codigo).join(", ")) : ""}
        ${linha("Prazo", [ad.dataInicio ? `início ${fmtD(ad.dataInicio)}` : null, ad.dataFimPrevista ? `fim previsto ${fmtD(ad.dataFimPrevista)}` : null].filter(Boolean).join(" · "))}
      </table>
      <p style="margin:0 0 6px 0;color:#576D7E;font-size:12px;text-transform:uppercase;letter-spacing:.04em;"><b>O que muda</b></p>
      <p style="margin:0 0 14px 0;color:#002945;font-size:14px;white-space:pre-line;">${esc(ad.descricao || "—")}</p>
      <p style="margin:0 0 6px 0;color:#576D7E;font-size:12px;text-transform:uppercase;letter-spacing:.04em;"><b>Providências por setor</b></p>
      <ul style="margin:0 0 16px 18px;padding:0;color:#002945;font-size:13px;line-height:1.5;">${PROVIDENCIAS.map(([s, o]) => `<li><b>${esc(s)}:</b> ${esc(o)}</li>`).join("")}</ul>
      <p style="margin:0 0 6px 0;color:#576D7E;font-size:12px;">O comunicado completo vai em PDF anexo. Detalhes na OP: <a href="${urlBase()}/comercial/${ad.op.id}" style="color:#006EAB;">${urlBase()}/comercial/${ad.op.id}</a></p>
      __ACEITE__
    </div>
  </div>`;
  return { subject, html };
}
