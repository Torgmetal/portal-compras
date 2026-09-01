// ─── O E-MAIL DA COTAÇÃO DE AÇO ───────────────────────────────────────────────────────────────
// Vitor (01/09/2026): "no caso do aço, quando tivermos uma lista específica por tipo do material
// seria interessante ter esse botão para podermos cotar também, pois isso é bem significativo para
// nós; quando é apenas usado peso na família do perfil fica mais difícil para comprarmos".
//
// ⚠ POR ISSO O E-MAIL LEVA A LISTA, e não as cinco famílias do quadro. "235 toneladas de perfil
// soldado" não é cotável; "CH 12,50 x 100, ASTM A572, 3.400 kg" é. A lista é a mesma que o Compras
// usaria numa RM — o fornecedor lê no formato que já conhece.
//
// ⚠⚠ MESMA MOLDURA DA CONSULTA DE TINTA e o mesmo aviso de que é ORÇAMENTO: sem preço nosso, sem
// concorrente, sem OP. Se o fornecedor confundir com pedido, reserva material de obra não vendida.
import { cabecalhoEmail } from "./email-layout";
import { escapeHtml } from "./html";

const kg = (v) => `${Number(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;

const linhaItem = (i, n) =>
  `<tr>` +
  `<td style="padding:5px 8px;border-bottom:1px solid #eef2f6;color:#8a97a5">${n}</td>` +
  `<td style="padding:5px 8px;border-bottom:1px solid #eef2f6">${escapeHtml(i.descricao || "—")}` +
  `${i.bitola ? `<br><span style="color:#5b6b7a;font-size:11.5px">${escapeHtml(i.bitola)}</span>` : ""}</td>` +
  `<td style="padding:5px 8px;border-bottom:1px solid #eef2f6">${escapeHtml(i.norma || "—")}</td>` +
  `<td style="padding:5px 8px;border-bottom:1px solid #eef2f6;text-align:right">${i.qtd ? Number(i.qtd).toLocaleString("pt-BR") : "—"}${i.unidade ? ` ${escapeHtml(i.unidade)}` : ""}</td>` +
  `<td style="padding:5px 8px;border-bottom:1px solid #eef2f6;text-align:right">${i.peso ? kg(i.peso) : "—"}</td>` +
  `</tr>`;

export function emailCotacaoAco(fornecedor, s = {}, ctx = {}) {
  const obra = ctx.obra || "obra em orçamento";
  const base = process.env.NEXT_PUBLIC_BASE_URL || "https://workspace.torg.com.br";
  const link = ctx.token ? `${base}/consulta-tinta/${ctx.token}` : null;
  const itens = Array.isArray(s.itens) ? s.itens : [];
  // ⚠ o e-mail mostra até 40 linhas: a lista completa está no portal, e um e-mail com 300 linhas é
  // um e-mail que ninguém lê.
  const mostra = itens.slice(0, 40);

  const html = `<div style="font-family:Arial,sans-serif;max-width:660px;margin:0 auto;color:#0D1F3C">
    ${cabecalhoEmail("Consulta de material — aço")}
    <div style="border:1px solid #e7ecf2;border-top:none;border-radius:0 0 8px 8px;padding:22px 26px">
      <p style="margin:0 0 12px">Olá <strong>${escapeHtml(fornecedor?.nome || "")}</strong>,</p>
      <p style="margin:0 0 14px">
        A Torg Metal está orçando a obra <strong>${escapeHtml(obra)}</strong> e gostaríamos do seu
        preço para o material abaixo.
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin:0 0 16px">
        <tr><td style="padding:5px 8px;background:#f6f8fa;width:45%">Peso total</td>
            <td style="padding:5px 8px;background:#f6f8fa"><strong>${kg(s.pesoKg)}</strong></td></tr>
        <tr><td style="padding:5px 8px">Itens na lista</td>
            <td style="padding:5px 8px"><strong>${itens.length}</strong></td></tr>
      </table>
      ${mostra.length ? `
        <table style="width:100%;border-collapse:collapse;font-size:12.5px;margin:0 0 8px">
          <tr style="background:#0D1F3C;color:#fff">
            <td style="padding:5px 8px">#</td><td style="padding:5px 8px">Descrição</td>
            <td style="padding:5px 8px">Norma</td><td style="padding:5px 8px;text-align:right">Qtd</td>
            <td style="padding:5px 8px;text-align:right">Peso</td>
          </tr>
          ${mostra.map((i, k) => linhaItem(i, k + 1)).join("")}
        </table>
        ${itens.length > mostra.length ? `<p style="margin:0 0 14px;color:#5b6b7a;font-size:12px">… e mais ${itens.length - mostra.length} item(ns) — a lista completa está no link abaixo.</p>` : ""}` : ""}
      <p style="margin:0 0 14px">
        Poderia nos informar o <strong>R$/kg de cada item</strong> (ou o preço fechado por item),
        além de prazo de entrega e condição de pagamento?
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
    subject: `Consulta de material — ${obra} · Torg Metal`,
    html,
    text: `Estamos orçando ${obra}. ${itens.length} item(ns), ${kg(s.pesoKg)} no total. Poderia informar o R$/kg de cada item, prazo e condição?${link ? ` Responda em ${link}` : ""}`,
  };
}
