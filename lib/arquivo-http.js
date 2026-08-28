// Nome de arquivo em cabeçalho HTTP.
//
// ⚠⚠ CABEÇALHO HTTP É ByteString (latin-1). Um caractere acima de 255 no nome do arquivo derruba
// a RESPOSTA INTEIRA — `new Response(...)` joga "Cannot convert argument to a ByteString" e o
// cliente recebe 500 sem nunca ver o documento. O assassino silencioso é o TRAVESSÃO "—" (U+2014),
// que está no título de quase todo documento nosso ("PIT T094 — Plano de Inspeção e Testes"):
// acento passa (á = 225), travessão não. Foi o que quebrou a página de assinatura do PIT/PLP
// (Vitor, 27/08/2026: "não consigo baixar para ver o pdf") — o PDF era gerado certinho e morria
// na hora de montar o cabeçalho.
//
// Manda o nome duas vezes, como manda a RFC 6266: `filename=` só com ASCII (o fallback) e
// `filename*=` em UTF-8 (RFC 5987), que é o que o navegador usa de verdade — assim o arquivo
// baixa com acento, travessão e · no nome.

const ASCII = (s) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")   // á → a
    .replace(/[\u2010-\u2015]/g, "-")                   // – — ― → -
    .replace(/[\u2018\u2019\u201C\u201D]/g, "'")        // aspas curvas
    .replace(/[^\x20-\x7E]/g, "-")                      // o que sobrou fora do ASCII
    .replace(/\s+/g, " ").trim();

// RFC 5987: encodeURIComponent deixa passar ' ( ) * , que não são attr-char.
const pct = (s) => encodeURIComponent(s).replace(/['()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

/**
 * Valor pronto do Content-Disposition.
 * @param {string} nome nome do arquivo COM extensão (pode ter acento/travessão)
 * @param {"inline"|"attachment"} tipo
 */
export function dispArquivo(nome, tipo = "inline") {
  const limpo = String(nome ?? "").replace(/[\r\n"\\]/g, " ").trim() || "documento";
  const ascii = ASCII(limpo) || "documento";
  return `${tipo}; filename="${ascii}"; filename*=UTF-8''${pct(limpo)}`;
}
