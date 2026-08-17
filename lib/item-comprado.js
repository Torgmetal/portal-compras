// Itens COMPRADOS / que não fazem parte da PRODUÇÃO — parafuso, porca, arruela, chumbador, cola,
// telha, calha, rufo, rebite, grade de piso, steel deck, cumeeira, abraçadeira, curva, tubo PVC…
// No FLUXO DE PRODUÇÃO (Corte/Montagem/Solda/…, TV de prioridades, painel de Liberar/Baixa) eles
// são IGNORADOS. Mas continuam valendo p/ Engenharia, Compras, Planejamento e Expedição, e a LE
// segue com 100% dos itens (LE ≠ LPC). Regra do Vitor (08/2026).
//
// Identificação = SÓ pelo NOME (descricao). O Vitor confirmou que mesmo os que vêm como conjunto
// com croqui (ex.: "CALHA SAÍDA RESÍDUOS", "SUPORTE CALHA", "CHUMBADOR", "ARRUELA CHAPA") NÃO
// fazem parte da produção → também são ignorados. (Não uso mais guard de estrutura de fabricação.)

const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// Palavras (casam início da palavra, cobrindo plural: parafusos, chumbadores…).
const PALAVRAS = [
  "parafuso", "porca", "arruela", "chumbador", "telha", "calha", "rufo",
  "rebite", "arrebite", "cumeeira", "cumieira", "cummeira", "abracadeira", "curva",
];
const RX_PALAVRA = new RegExp(`\\b(?:${PALAVRAS.join("|")})`);
const RX_COLA = /\bcola\b/;                                  // "COLA QUIMICA" (evita "colado/colar")
const RX_FRASE = /grade\s+de\s+piso|steel\s*deck|tubo\s+(?:de\s+)?pvc/;
const RX_PVC = /\bpvc\b/;

// Só o TEXTO da descrição casa um item comprado?
export function descricaoDeComprado(desc) {
  const d = norm(desc);
  if (!d) return false;
  return RX_PALAVRA.test(d) || RX_COLA.test(d) || RX_FRASE.test(d) || RX_PVC.test(d);
}

// Item comprado / fora da produção (IGNORAR): basta o NOME casar (Vitor: os "mantidos" — calha/
// chumbador conjunto, arruela-chapa — também não fazem parte da produção).
export function ehItemComprado(p) {
  return descricaoDeComprado(p?.descricao);
}
