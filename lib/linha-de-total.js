// ─── O RODAPÉ DA PLANILHA NÃO É UMA PEÇA ─────────────────────────────────────
//
// ⚠⚠ ESSA LINHA JÁ DOBROU O PESO DE UMA OBRA. A FORM 21 termina com um rodapé cuja "marca" é
// "TOTAL.:" e cuja quantidade é a SOMA de todas as outras — então o descarte por `qtd === 0` não
// pega. A OP-071 aparecia com 18.664 kg (9.332 reais + 9.332 do rodapé) e a OP-089 com uma marca
// de 8.705 peças. Quatro obras (060, 067, 085, 089) chegaram a ter a linha gravada no banco.
//
// ⚠⚠ A REGRA MORA AQUI PORQUE ELA ESTAVA EM TRÊS LUGARES COM TRÊS ABRANGÊNCIAS DIFERENTES
// (17/09/2026): o parser pulava só o que começa com "total"; o importador da L.E. cobria
// TOTAL|SUBTOTAL|SOMA; a leitura da expedição, idem. Resultado: quem importa pelo SharePoint
// (`lib/lista-avancada-sharepoint.js`) grava `parsed.marcas` direto, sem passar pelo importador —
// uma planilha com "SUBTOTAL" entrava por ali e inflava marcas, itens e peso contratado.
//
// ⚠ Módulo próprio, sem `server-only` e sem dependência, para que o PARSER possa usá-lo. O
// `lib/itens-expedicao.js` é `server-only` e importá-lo de dentro do parser amarraria o parser ao
// servidor por causa de uma expressão regular.
export const ehLinhaDeTotal = (marca) =>
  /^\s*(TOTAL|SUBTOTAL|SOMA)\b/i.test(
    String(marca ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  );
