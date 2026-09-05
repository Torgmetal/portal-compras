import "server-only";

// ─── AS PRIMITIVAS DE TABELA DO WORD ──────────────────────────────────────────────────────────
//
// ⚠⚠ O ESTILO É COPIADO DA TABELA DE HORAS OCIOSAS DO PRÓPRIO MODELO: Arial 10 pt, borda simples
// sz 4, largura 9781 dxa. Tabela construída "no capricho" mas com outra fonte denuncia documento
// gerado por máquina na hora em que o cliente compara com a proposta anterior.
//
// Isto saiu de lib/proposta-tabela-preco quando o cronograma passou a precisar do MESMO estilo.
// Duas cópias das mesmas constantes é como a tabela nova nasce com 9 pt e ninguém percebe até a
// proposta estar com o cliente.
export const LARGURA = 9781;
export const FONTE = '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="20"/><w:szCs w:val="20"/>';

export const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const num = (v, casas = 2) =>
  Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

export function celula({ w, texto, al = "left", negrito = false, fundo = null }) {
  const rPr = `<w:rPr>${FONTE}${negrito ? "<w:b/><w:bCs/>" : ""}</w:rPr>`;
  const sombra = fundo ? `<w:shd w:val="clear" w:color="auto" w:fill="${fundo}"/>` : "";
  return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${sombra}</w:tcPr>`
    + `<w:p><w:pPr><w:jc w:val="${al}"/>${rPr}</w:pPr>`
    + `<w:r>${rPr}<w:t xml:space="preserve">${esc(texto)}</w:t></w:r></w:p></w:tc>`;
}

export const linha = (celulas) => `<w:tr>${celulas.join("")}</w:tr>`;

/** Fecha a tabela com a grade e as bordas do modelo. */
export function montarTabela(colunas, linhas) {
  const bordas = ["top", "left", "bottom", "right", "insideH", "insideV"]
    .map((b) => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="000000"/>`).join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="${LARGURA}" w:type="dxa"/>`
    + `<w:tblBorders>${bordas}</w:tblBorders>`
    + `<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>`
    + `</w:tblPr><w:tblGrid>${colunas.map((c) => `<w:gridCol w:w="${c.w}"/>`).join("")}</w:tblGrid>`
    + linhas.join("") + `</w:tbl>`;
}
