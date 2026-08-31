// ─── O E-MAIL DA CONSULTA DE TINTAS ───────────────────────────────────────────────────────────
// Vitor (31/08/2026): "pode me mostrar a tela que o fornecedor da tinta vai receber?".
//
// ⚠ O TEMPLATE MORA AQUI, e não dentro da rota, justamente por causa dessa pergunta: a prévia
// precisa ser o e-mail, não uma reconstrução parecida. Com duas cópias, a que ele revisa e a que
// sai divergem na primeira alteração — e o texto que chega ao fornecedor é o que vale.
//
// ⚠⚠ O QUE NÃO ENTRA, ENTRA POR DECISÃO: sem preço nosso, sem nome de concorrente, sem número de OP
// e sem link para o portal de cotação do Compras. Vitor: "precisa ser um portal totalmente separado
// do de compras (…) para não confundir com o recebimento dos e-mails que fazemos no portal de
// compras". Se o fornecedor confundir os dois, reserva estoque para uma obra que ainda não foi
// vendida.
import { cabecalhoEmail } from "./email-layout";
import { escapeHtml } from "./html";

const linhaCamada = (c) =>
  `<tr><td style="padding:5px 8px;border-bottom:1px solid #eef2f6"><strong>${escapeHtml(c.camada || "")}</strong></td>` +
  `<td style="padding:5px 8px;border-bottom:1px solid #eef2f6">${escapeHtml(c.produto || "—")}</td>` +
  `<td style="padding:5px 8px;border-bottom:1px solid #eef2f6;text-align:right">${c.peliculaSeca ?? "—"} µm</td>` +
  `<td style="padding:5px 8px;border-bottom:1px solid #eef2f6;text-align:right">${c.solidos ?? "—"}%</td>` +
  `<td style="padding:5px 8px;border-bottom:1px solid #eef2f6">${escapeHtml(c.cor || "—")}</td></tr>`;

/**
 * @param {{nome:string}} fornecedor
 * @param {{areaM2:number, perda:number, perdaNota?:string, camadas?:object[], fabricante?:string}} s
 * @param {{obra:string, numero?:string|number, ano?:string|number}} ctx
 */
export function emailCotacaoTinta(fornecedor, s = {}, ctx = {}) {
  const obra = ctx.obra || "obra em orçamento";
  // ⚠ O LINK É O PORTAL DELE, não o do Compras. Sem link, a resposta volta em texto de e-mail e o
  // mapa de cotações não existe — alguém teria de digitar a proposta de cada um à mão, que é
  // exatamente onde o número erra.
  const base = process.env.NEXT_PUBLIC_BASE_URL || "https://workspace.torg.com.br";
  const link = ctx.token ? `${base}/consulta-tinta/${ctx.token}` : null;
  const html = `<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#0D1F3C">
    ${cabecalhoEmail("Consulta técnica de tintas")}
    <div style="border:1px solid #e7ecf2;border-top:none;border-radius:0 0 8px 8px;padding:22px 26px">
      <p style="margin:0 0 12px">Olá <strong>${escapeHtml(fornecedor?.nome || "")}</strong>,</p>
      <p style="margin:0 0 14px">
        A Torg Metal está orçando a obra <strong>${escapeHtml(obra)}</strong> e gostaríamos da sua
        ajuda para dimensionar o sistema de pintura.
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin:0 0 16px">
        <tr><td style="padding:5px 8px;background:#f6f8fa;width:45%">Área total a pintar</td>
            <td style="padding:5px 8px;background:#f6f8fa"><strong>${Number(s.areaM2 || 0).toLocaleString("pt-BR")} m²</strong></td></tr>
        <tr><td style="padding:5px 8px">Coeficiente de perda</td>
            <td style="padding:5px 8px"><strong>${escapeHtml(String(s.perda ?? "45"))}%</strong>${s.perdaNota ? ` <span style="color:#5b6b7a">(${escapeHtml(s.perdaNota)})</span>` : ""}</td></tr>
        ${s.fabricante ? `<tr><td style="padding:5px 8px;background:#f6f8fa">Especificação do cliente</td><td style="padding:5px 8px;background:#f6f8fa">${escapeHtml(s.fabricante)}</td></tr>` : ""}
      </table>
      ${Array.isArray(s.camadas) && s.camadas.length ? `
        <p style="margin:0 0 6px;font-weight:bold">Esquema de pintura</p>
        <table style="width:100%;border-collapse:collapse;font-size:12.5px;margin:0 0 16px">
          <tr style="background:#0D1F3C;color:#fff">
            <td style="padding:5px 8px">Demão</td><td style="padding:5px 8px">Produto / resina</td>
            <td style="padding:5px 8px;text-align:right">Película seca</td>
            <td style="padding:5px 8px;text-align:right">Sólidos</td><td style="padding:5px 8px">Cor</td>
          </tr>
          ${s.camadas.map(linhaCamada).join("")}
        </table>` : ""}
      <p style="margin:0 0 14px">
        Com base nisso, poderia nos informar <strong>quantos galões de cada demão</strong>,
        <strong>quanto de diluente</strong> e <strong>quanto de componente B</strong> seriam
        necessários para atender essa área — e o preço de cada item?
      </p>
      ${link ? `<p style="text-align:center;margin:24px 0">
        <a href="${link}" style="background:#006EAB;color:#fff;text-decoration:none;padding:13px 30px;border-radius:8px;font-size:15px;font-weight:bold;display:inline-block">Responder a consulta</a>
      </p>
      <p style="margin:0 0 14px;color:#5b6b7a;font-size:12px">
        Ou copie e cole no navegador:<br><span style="color:#006EAB;word-break:break-all">${link}</span>
      </p>` : ""}
      <p style="margin:0 0 14px;color:#5b6b7a;font-size:13px">
        Estamos em fase de orçamento: ainda não é um pedido de compra. Se preferir, pode responder
        este e-mail.
      </p>
      <p style="margin:0;color:#5b6b7a;font-size:12px">Consulta ${escapeHtml(String(ctx.numero || ""))}/${escapeHtml(String(ctx.ano || ""))} · Engenharia Comercial — Torg Metal</p>
    </div>
  </div>`;

  return {
    subject: `Consulta de tintas — ${obra} · Torg Metal`,
    html,
    text: `Estamos orçando ${obra}. Área a pintar: ${Number(s.areaM2 || 0).toLocaleString("pt-BR")} m², perda ${s.perda ?? 45}%. Poderia informar galões, diluente e componente B necessários, com preço?${link ? ` Responda em ${link}` : " Responda este e-mail."}`,
  };
}
