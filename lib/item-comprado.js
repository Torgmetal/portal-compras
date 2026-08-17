// Itens COMPRADOS / não fabricados por nós (parafuso, porca, arruela, chumbador, cola, telha,
// calha, rufo, rebite, grade de piso, steel deck, cumeeira, abraçadeira, curva, tubo PVC…).
// No FLUXO DE PRODUÇÃO (Corte/Montagem/Solda/…, TV de prioridades, painel de Liberar/Baixa) eles
// são IGNORADOS — não passam pela fábrica. Mas continuam valendo p/ Engenharia, Compras,
// Planejamento e Expedição, e a LE segue com 100% dos itens (LE ≠ LPC). Regra do Vitor (08/2026).
//
// Identificação: o NOME casa um item comprado E a peça NÃO tem estrutura de fabricação
// (não é conjunto, não tem croqui e não tem perfil de aço). Assim uma "CALHA SAÍDA RESÍDUOS" ou
// um "CHUMBADOR" que são CONJUNTOS com croqui (feitos por nós) continuam na produção.

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

// Tem sinal de FABRICAÇÃO → então NÃO é comprado, mesmo que o nome bata (calha/chumbador conjunto).
function temEstruturaFabricacao(p) {
  const croquis = p?.croquiCount ?? p?._count?.conjuntoCroquis ?? 0;
  const temPerfil = !!(p?.perfil && String(p.perfil).trim());
  return p?.tipoPeca === "CONJUNTO" || p?.tipoPeca === "CROQUI" || croquis > 0 || temPerfil;
}

// Item comprado (IGNORAR na produção): nome de comprado E sem estrutura de fabricação.
// Aceita a peça com `_count.conjuntoCroquis` (Prisma) ou `croquiCount` (loader da TV).
export function ehItemComprado(p) {
  return descricaoDeComprado(p?.descricao) && !temEstruturaFabricacao(p);
}
