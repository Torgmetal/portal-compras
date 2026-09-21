// ─── QUEM PAGA E QUEM LEVA O FRETE ───────────────────────────────────────────
//
// Matheus (17/09/2026): "uma opção para ele selecionar se o frete é CIF ou FOB, com legenda de
// cada uma. Baseado nessa informação eu quero essa informação na tela de Prazos das RMs (…) aí dá
// para eu saber o que preciso programar coleta e o que vai ser entregue pelo fornecedor".
//
// ⚠⚠ A PERGUNTA QUE ISSO RESPONDE É OPERACIONAL, NÃO CONTÁBIL: "preciso mandar buscar?". Por isso
// cada opção carrega uma `acao` além do rótulo — é ela que a tela de Prazos mostra, porque
// "FOB" sozinho não diz a ninguém que existe uma coleta para programar.
//
// ⚠ Definição num lugar só porque são DUAS telas com o mesmo conceito: o portal do fornecedor
// (onde ele escolhe) e os Prazos das RMs (onde o comprador lê). Duas cópias divergiriam no dia em
// que alguém mudasse uma legenda.

export const FRETES = {
  CIF: {
    valor: "CIF",
    rotulo: "CIF — entrega por conta do fornecedor",
    // ⚠ A legenda é em português de quem opera, não a sigla traduzida. "Cost, Insurance and
    // Freight" não ajuda ninguém no almoxarifado a decidir se manda o caminhão.
    legenda: "O fornecedor entrega o material no endereço combinado. O frete já está no preço.",
    acao: "Entrega do fornecedor",
    cor: "emerald",
  },
  FOB: {
    valor: "FOB",
    rotulo: "FOB — coleta por conta da Torg",
    legenda: "A Torg retira o material no fornecedor. O frete NÃO está no preço e a coleta precisa ser programada.",
    acao: "Coletar",
    cor: "orange",
  },
};

export const FRETES_VALIDOS = Object.keys(FRETES);

/** O tipo de frete de uma cotação, normalizado — qualquer coisa fora da lista vira `null`. */
export function freteDe(cotacao) {
  const v = String(cotacao?.tipoFrete || "").trim().toUpperCase();
  return FRETES_VALIDOS.includes(v) ? v : null;
}

export const rotuloFrete = (v) => FRETES[v]?.rotulo || v || "";
export const acaoFrete = (v) => FRETES[v]?.acao || "";
export const legendaFrete = (v) => FRETES[v]?.legenda || "";
