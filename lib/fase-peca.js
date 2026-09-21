// ─── A FASE DE UMA PEÇA ───────────────────────────────────────────────────────
// Vitor (14/09/2026): "precisamos que separe por fases, no caso da 89 temos A e C por hora, logo
// teremos a B, porém a engenharia não liberou". A obra sai em FRENTES (fases) e cada frente tem a
// sua lista — a Qualidade inspeciona, pinta e embarca por fase, então toda tela que lista peça para
// o inspetor separa por ela.
//
// ⚠ A FASE VEM DA FRENTE DA LPC, NÃO DA MARCA — quando existe. A LPC guarda a frente em
// `opNumero` ("T89A", "T89C"; ver [[torg_pecaconjunto_opnumero]]) e é ela que diz em qual lista a
// engenharia liberou a peça. Só quando a chave não tem letra ("097", "T92", "089" da LE) a letra da
// marca (T97A1 → A) responde — é a mesma convenção, lida de outro lugar.
//
// ⚠ "?" É SEM FASE, NÃO ERRO: marca fora do padrão (acessório "T89-AC1", item sem prefixo) fica
// num grupo próprio no fim, em vez de sumir da lista.
import { faseDaMarca, prefixoDaOp } from "./carga/classificar";

export const SEM_FASE = "?";

/** Letra da fase: da frente da LPC (`opNumero` T89A → A) ou, na falta, da marca. */
export function faseDaPeca(p, opNumeroDaOp) {
  const chave = String(p?.opNumero || "").toUpperCase().replace(/\s+/g, "");
  const m = chave.match(/^T\d+([A-Z]+)$/);
  if (m) return m[1];
  return faseDaMarca(p?.marca, opNumeroDaOp ? prefixoDaOp(opNumeroDaOp) : null);
}

/** "A" → "Fase A"; "?" → "Sem fase". */
export const rotuloFase = (f) => (!f || f === SEM_FASE ? "Sem fase" : `Fase ${f}`);

/** Fases em ordem (A, B, C… e "Sem fase" por último), sem repetição. */
export function ordenarFases(fases) {
  return [...new Set((fases || []).filter(Boolean))].sort((a, b) => {
    if (a === SEM_FASE) return 1;
    if (b === SEM_FASE) return -1;
    return a.localeCompare(b, "pt");
  });
}
