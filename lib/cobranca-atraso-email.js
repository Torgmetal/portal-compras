// ─── O E-MAIL DE COBRANÇA DE ATRASO ──────────────────────────────────────────
//
// Texto aprovado por Matheus em 17/09/2026. As escolhas que ele carrega:
//
// ⚠⚠ PERGUNTA DUAS DATAS, NÃO UMA. "Entrego dia 25" e "está pronto dia 22" levam a programações
// diferentes no pátio — Matheus pediu prazo de entrega E previsão de carregamento. Como ninguém
// tem CIF/FOB respondido ainda (0 de 24 em 17/09), "pronto para carregamento" é a formulação que
// funciona nos dois casos; quando o campo encher, dá para afiar a pergunta por fornecedor.
//
// ⚠⚠ A COLUNA "SITUAÇÃO" EXISTE POR CAUSA DOS PARCIAIS. Metade dos pedidos atrasados da SOUFER já
// teve entrega parcial. Sem essa coluna o e-mail lista o pedido inteiro como pendente, e o
// fornecedor responde "já mandamos" — com razão.
//
// ⚠ PEDE A NOTA FISCAL DE VOLTA: é a saída mais barata para a lista encolher sozinha. Pedido
// faturado que o Omie ainda não refletiu sai do radar sem ninguém investigar.
//
// ⚠ NADA DE ACUSAÇÃO. "Já passaram da data combinada" é fato. "Estão atrasados há 29 dias,
// precisamos de uma posição urgente" fecha a porta com quem a Torg vai precisar na semana que vem.
import { cabecalhoEmail, escaparHtml as esc } from "@/lib/email-layout";

const fmt = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/** "29 dias", "1 dia". */
const atraso = (n) => plural(n, "dia", "dias");

/** A obra, como o fornecedor a reconhece: número da OP e cliente. */
const obraDe = (l) => [l.opNumero ? `OP ${String(l.opNumero).padStart(3, "0")}` : null, l.opCliente || null]
  .filter(Boolean).join(" · ") || "—";

// ⚠ `white-space:nowrap` nas colunas de CÓDIGO (pedido, RM, atraso): "T118-001-R00" quebrado em
// três linhas deixa de ser reconhecível de relance, e é por ele que o fornecedor acha o pedido no
// sistema dele.
const TD = "padding:9px 10px;border-bottom:1px solid #e8eef3;font-size:13px;color:#23485f;";
const TH = "padding:9px 10px;border-bottom:2px solid #d7e2eb;font-size:11px;letter-spacing:.4px;color:#5d7b8d;text-align:left;";

function linhaHtml(l, link) {
  const prazo = `${fmt(l.previsao)}${l.prazoOriginal ? `<br><span style="font-size:11px;color:#8196a5;">combinado antes: ${fmt(l.prazoOriginal)}</span>` : ""}`;
  return `<tr>
    <td style="${TD}font-weight:bold;white-space:nowrap;">${esc(l.numeroPedido ?? "—")}</td>
    <td style="${TD}white-space:nowrap;">${esc(l.rmNumero || "—")}</td>
    <td style="${TD}">${esc(obraDe(l))}</td>
    <td style="${TD}">${prazo}</td>
    <td style="${TD}color:#b3401c;white-space:nowrap;">${atraso(l.diasAtraso)}</td>
    <td style="${TD}">${l.parcial ? "recebido parcial" : "aguardando"}</td>
    <td style="${TD}"><a href="${esc(link)}" style="color:#006EAB;">informar</a></td>
  </tr>`;
}

/**
 * Monta o e-mail de um fornecedor.
 *
 * @param {{nome:string, pedidos:object[]}} grupo
 * @param {Record<string,string>} links  id do pedido → URL pública de previsão
 */
export function gerarEmailCobranca(grupo, links = {}) {
  const n = grupo.pedidos.length;
  const quantos = plural(n, "pedido", "pedidos");
  // ⚠ O assunto diz o QUE e QUANTOS. "Acompanhamento de entrega" sozinho é o assunto de metade
  // dos e-mails que um comercial recebe por dia.
  const assunto = `Torg Metal · Previsão de entrega — ${quantos} em aberto`;

  const corpo = `
    <p style="margin:0 0 14px;font-size:14px;line-height:1.8;">Prezados,</p>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.8;">
      Estamos programando a produção das obras abaixo e precisamos confirmar com vocês a posição de
      <strong>${quantos}</strong> que já ${n === 1 ? "passou" : "passaram"} da data de entrega combinada.
    </p>
    <p style="margin:0 0 6px;font-size:14px;line-height:1.8;">Pedimos a gentileza de nos informar, para cada um:</p>
    <ol style="margin:0 0 18px;padding-left:22px;font-size:14px;line-height:1.9;color:#23485f;">
      <li><strong>a nova data de entrega</strong>; e</li>
      <li><strong>quando o material estará pronto para carregamento</strong> — é essa data que nos
          permite programar o recebimento e liberar a produção.</li>
    </ol>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #e8eef3;margin-bottom:20px;">
      <thead><tr style="background:#f4f8fb;">
        <th style="${TH}">PEDIDO</th><th style="${TH}">RM</th><th style="${TH}">OBRA</th>
        <th style="${TH}">PRAZO COMBINADO</th><th style="${TH}">ATRASO</th><th style="${TH}">SITUAÇÃO</th><th style="${TH}">PREVISÃO</th>
      </tr></thead>
      <tbody>${grupo.pedidos.map((l) => linhaHtml(l, links[l.id] || "")).join("")}</tbody>
    </table>
    <p style="margin:0 0 14px;font-size:14px;line-height:1.8;">
      Se algum desses pedidos já tiver sido faturado ou despachado, por favor nos envie o número da
      nota fiscal — damos baixa e ele sai desta lista.
    </p>
    <p style="margin:0 0 14px;font-size:14px;line-height:1.8;">
      E se algum prazo não puder ser cumprido, preferimos saber agora: com antecedência conseguimos
      remanejar a programação, o que deixa de ser possível na semana da montagem.
    </p>
    <p style="margin:0 0 20px;font-size:13px;line-height:1.8;color:#5d7b8d;">
      Você pode responder diretamente a este e-mail, ou usar o link <strong>“informar”</strong> ao lado
      de cada pedido — assim a nova previsão entra no nosso sistema na hora.
    </p>
    <p style="margin:22px 0 0;font-size:14px;line-height:1.8;">Desde já agradecemos a atenção.</p>
    <p style="margin:14px 0 0;font-size:13px;font-weight:bold;color:#183f57;">Equipe de Compras — Torg Metal</p>`;

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#edf2f6;font-family:Arial,sans-serif;color:#18394f;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:720px;background:#ffffff;border:1px solid #dce5ed;">
<tr><td>${cabecalhoEmail("Previsão de entrega", esc(grupo.nome))}</td></tr>
<tr><td style="padding:28px;">${corpo}</td></tr>
<tr><td style="padding:15px 28px;background:#eaf1f6;color:#6c8393;font-size:10px;line-height:1.7;">
Torg Metal · Estruturas Metálicas — ${quantos} em aberto em ${fmt(new Date())}</td></tr>
</table></td></tr></table></body></html>`;

  // ⚠⚠ O TEXTO PLANO NÃO É ENFEITE: cliente de e-mail que bloqueia HTML, filtro de spam e leitor
  // de tela leem daqui. Um e-mail só-HTML pontua pior e pode nem ser lido.
  const texto = [
    "Prezados,",
    "",
    `Estamos programando a produção das obras abaixo e precisamos confirmar com vocês a posição de ${quantos} que já ${n === 1 ? "passou" : "passaram"} da data de entrega combinada.`,
    "",
    "Pedimos a gentileza de nos informar, para cada um:",
    "  1. a nova data de entrega; e",
    "  2. quando o material estará pronto para carregamento — é essa data que nos permite programar o recebimento e liberar a produção.",
    "",
    ...grupo.pedidos.flatMap((l) => [
      `Pedido ${l.numeroPedido ?? "—"} · RM ${l.rmNumero || "—"} · ${obraDe(l)}`,
      `   prazo combinado ${fmt(l.previsao)}${l.prazoOriginal ? ` (combinado antes: ${fmt(l.prazoOriginal)})` : ""} · ${atraso(l.diasAtraso)} de atraso · ${l.parcial ? "recebido parcial" : "aguardando"}`,
      links[l.id] ? `   informar previsão: ${links[l.id]}` : null,
    ].filter(Boolean)),
    "",
    "Se algum desses pedidos já tiver sido faturado ou despachado, por favor nos envie o número da nota fiscal — damos baixa e ele sai desta lista.",
    "",
    "E se algum prazo não puder ser cumprido, preferimos saber agora: com antecedência conseguimos remanejar a programação, o que deixa de ser possível na semana da montagem.",
    "",
    "Desde já agradecemos a atenção.",
    "",
    "Equipe de Compras — Torg Metal",
  ].join("\n");

  return { assunto, html, texto };
}
