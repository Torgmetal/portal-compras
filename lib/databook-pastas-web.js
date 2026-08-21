// Espelho CLIENT-SAFE de quais seções têm pasta no servidor.
//
// `lib/databook-pastas.js` é server-only (fala com o Graph), então o componente da tela não pode
// importá-lo — a lista de seções navegáveis vive aqui e as duas precisam bater. Poucas linhas
// duplicadas valem mais que arrastar o cliente do SharePoint pro browser.
export const SECOES_NAVEGAVEIS = ["02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "13", "14", "15", "19"];
export const secaoNavega = (numero) => SECOES_NAVEGAVEIS.includes(String(numero));
