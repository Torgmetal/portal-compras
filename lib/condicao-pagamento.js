// Mapeia o prazo de pagamento (texto livre da cotação) para o código de
// condição de pagamento (cCodParc) JÁ cadastrado no Omie da Torg.
//
// O mapa abaixo foi extraído das condições reais cadastradas no Omie
// (diagnóstico 2026-06: cada código → padrão de dias das parcelas, via nDias).
// Se cadastrarem uma condição nova no Omie, é só acrescentar a linha aqui.
//
// Chave = padrão de dias canônico ("28/42/56"); valor = cCodParc.
const MAPA_DIAS_CCODPARC = {
  "0": "000",                     // à vista
  "15": "A15",
  "21": "A21",
  "28": "A28",
  "30": "A30",
  "28/42": "S23",
  "30/60": "S01",
  "28/42/56": "S12",
  "30/45/60": "S07",
  "30/60/90": "S18",
  "30/60/90/120": "S25",
  "30/60/90/120/150/180": "T26",
};

/**
 * Extrai os dias do texto livre do prazo → chave canônica ("28/42/56").
 * Ex.: "28/42/56 DDL" → "28/42/56"; "30 dias" → "30"; "à vista" → "0".
 * Ignora ruído ("boleto", "DDL", "Faturado", "data Nota Fiscal").
 * @param {string} texto
 * @returns {string|null}
 */
export function diasDoPrazo(texto) {
  const s = String(texto || "").toLowerCase();
  if (/(a\s*vista|à\s*vista|avista)/.test(s)) return "0";
  const dias = (s.match(/\d{1,3}/g) || []).map(Number).filter((n) => n >= 1 && n <= 360);
  return dias.length ? dias.join("/") : null;
}

/**
 * Resolve { cCodParc, nQtdeParc } a partir do prazo livre da cotação.
 * Retorna null se o prazo não casar com nenhuma condição cadastrada — nesse
 * caso o pedido sai sem condição explícita (default do Omie), sem quebrar.
 * @param {string} prazoTexto
 * @returns {{ cCodParc: string, nQtdeParc: number } | null}
 */
export function resolverCondicaoPagamento(prazoTexto) {
  const chave = diasDoPrazo(prazoTexto);
  if (!chave) return null;
  const cCodParc = MAPA_DIAS_CCODPARC[chave];
  if (!cCodParc) return null;
  const nQtdeParc = chave === "0" ? 1 : chave.split("/").length;
  return { cCodParc, nQtdeParc };
}
