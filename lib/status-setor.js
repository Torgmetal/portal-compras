// ─── A SITUAÇÃO DE UMA PEÇA NUM SETOR ───────────────────────────────────────
//
// Uma regra só para duas telas: PCP › Produção (a de trabalho, com liberar e baixar) e Produção ›
// Corte e montagem (a de consulta dos gerentes de setor, no celular — Matheus, 03/10/2026). Escrita
// em dois lugares, a primeira mudança de critério faria a mesma peça estar "finalizada" numa e "em
// produção" na outra.
//
// ⚠ É DERIVADO, não é campo. Vitor (24/08/2026): finalizado é o que a fábrica fechou (Syneco atingiu
// a quantidade) OU o que alguém baixou no portal — as duas querem dizer a mesma coisa. Guardar um
// campo à parte criaria uma terceira verdade para brigar com essas duas.

/**
 * O que já saiu da peça neste setor: o MAIOR entre o apontado no Syneco e a baixa do portal. São dois
 * registros da mesma coisa — somar contaria duas vezes.
 */
export function feitoDaPeca(p) {
  return Math.max(Number(p?.produzidoSyneco) || 0, Number(p?.baixadoQtd) || 0);
}

export function situacaoDaPeca(p) {
  if (p.expedida) return "EXPEDIDA";
  const qtd = Number(p.qte) || 0;
  const feito = feitoDaPeca(p);
  if (p.baixadoPortal && (Number(p.baixadoQtd) || 0) >= qtd) return "FINALIZADO";
  if (qtd > 0 && feito >= qtd) return "FINALIZADO";
  if (feito > 0) return "PARCIAL";
  if (p.programacao?.situacao === "INICIADA") return "PARCIAL";
  return "NAO_INICIADO";
}

// ⚠ `barra` é a classe INTEIRA, escrita à mão. O Tailwind varre o código como TEXTO: classe montada
// em tempo de execução não existe no CSS gerado e a faixa simplesmente não aparece.
export const SIT = {
  NAO_INICIADO: { txt: "não iniciado", cls: "bg-gray-100 text-gray-600 border-gray-200", barra: "border-l-gray-200", dica: "Nada apontado no Syneco e sem baixa no portal." },
  PARCIAL:      { txt: "em produção",  cls: "bg-sky-50 text-sky-700 border-sky-200",     barra: "border-l-sky-400",  dica: "A fábrica começou e ainda não fechou a quantidade." },
  FINALIZADO:   { txt: "finalizado",   cls: "bg-emerald-50 text-emerald-700 border-emerald-200", barra: "border-l-emerald-500", dica: "Quantidade fechada no Syneco ou baixa dada no portal." },
  EXPEDIDA:     { txt: "expedida",     cls: "bg-emerald-100 text-emerald-800 border-emerald-300", barra: "border-l-emerald-600", dica: "Já saiu em romaneio — a Expedição assumiu." },
};

/** Finalizada ou expedida: o setor terminou esta peça. */
export const pecaPronta = (p) => ["FINALIZADO", "EXPEDIDA"].includes(situacaoDaPeca(p));

/**
 * O resumo do topo da tela dos gerentes: quantas peças em cada situação e, na Montagem, quantos
 * conjuntos já têm todos os croquis cortados.
 */
export function resumoDoSetor(pecas = []) {
  const r = { total: pecas.length, naoIniciado: 0, emProducao: 0, prontas: 0, conjuntosProntosParaMontar: 0, conjuntosAguardandoCorte: 0 };
  for (const p of pecas) {
    const s = situacaoDaPeca(p);
    if (s === "NAO_INICIADO") r.naoIniciado++;
    else if (s === "PARCIAL") r.emProducao++;
    else r.prontas++;
    if (p.totalCroquis && !pecaPronta(p)) {
      if (p.prontoMontar) r.conjuntosProntosParaMontar++;
      else r.conjuntosAguardandoCorte++;
    }
  }
  return r;
}
