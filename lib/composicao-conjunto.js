// ─── A COMPOSIÇÃO DE CADA CONJUNTO NA MONTAGEM ──────────────────────────────
//
// Saiu de /api/pcp/despacho para poder ser testada sozinha (achado do Codex, 15/10/2026). Para cada
// conjunto: pronto para montar? quais croquis faltam cortar ("faltam 2 de 4") e a composição INTEIRA
// (marca, material, quantidade) — Matheus (15/10/2026): a busca acha o conjunto pelo croqui ou pelo
// material, e o cartão abre as peças que o compõem, cortadas inclusive.
//
// ⚠⚠ DUAS FONTES, DE PROPÓSITO. O que é CORTADO vem de `croquiMap` (as peças da fila, com produção e
// baixa); o que o croqui É (material, quantidade) vem do VÍNCULO. A fila já tirou o croqui no
// terceiro e o item comprado — tirar o material junto fazia a busca não achar o conjunto que usa.
import { croquiCortado } from "./prioridades-setor";

/** Quantos ainda faltam cortar deste croqui (qte total menos o já cortado/baixado). */
function faltaCortarQtd(cr) {
  const q = Number(cr?.qte) || 1;
  const bxC = cr?.baixaSetores && typeof cr.baixaSetores === "object" ? cr.baixaSetores.CORTE : null;
  const cortado = Math.max(Number(cr?.qteProduzida) || 0, bxC ? (bxC.qtd != null ? Number(bxC.qtd) : q) : 0);
  return Math.max(1, q - cortado);
}

/**
 * @param {Array<{conjunto:{marca:string}, croqui:{marca:string, perfil?:string, descricao?:string, qte?:number}}>} links
 * @param {Map<string, object>} croquiMap  marca → croqui da fila (com qteProduzida/baixaSetores)
 * @returns {Map<string, {prontoMontar:boolean, faltamCroquis:Array, totalCroquis:number, croquis:Array}>}
 */
export function composicaoDosConjuntos(links, croquiMap) {
  const porConj = new Map();
  const doVinculo = new Map();
  for (const lk of links || []) {
    const a = porConj.get(lk.conjunto.marca) || []; a.push(lk.croqui.marca); porConj.set(lk.conjunto.marca, a);
    doVinculo.set(lk.croqui.marca, {
      material: String(lk.croqui.perfil || lk.croqui.descricao || "").trim() || null,
      qtd: Number(lk.croqui.qte) || null,
    });
  }
  const info = new Map();
  for (const [conj, croquis] of porConj) {
    const faltam = [];
    for (const cm of croquis) {
      const cr = croquiMap.get(cm);
      // croquiCortado (critério ÚNICO, igual à TV): corte concluído / qtd produzida / baixa no corte.
      // `qtd` é o total do croqui: a tela escreve "faltam 2 de 4" (Matheus, 03/10/2026).
      if (!croquiCortado(cr)) faltam.push({ marca: cm, descricao: cr?.descricao || null, faltaQtd: faltaCortarQtd(cr), qtd: Number(cr?.qte) || null });
    }
    // compacto de propósito — a OP-118 tem 919 conjuntos
    const todos = croquis.map((cm) => ({ marca: cm, material: doVinculo.get(cm)?.material ?? null, qtd: doVinculo.get(cm)?.qtd ?? null }));
    info.set(conj, { prontoMontar: faltam.length === 0, faltamCroquis: faltam, totalCroquis: croquis.length, croquis: todos });
  }
  return info;
}
