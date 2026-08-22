// ─── QUE INSTRUMENTO CABE EM QUE RELATÓRIO ────────────────────────────────────
// Vitor (22/08/2026): "não consegue deixar apenas os instrumentos necessários listados
// nos procedimentos de cada relatório? assim evita o erro de colocar equipamentos que
// não deveria".
//
// A lista de calibração é da fábrica inteira: tem máquina de solda, alicate
// voltímetro e torquímetro, que não medem nada num relatório de inspeção. Oferecer os
// 31 em toda folha convida ao erro — e instrumento errado no relatório é pior que
// instrumento faltando, porque afirma que a peça foi medida com algo que não mede
// aquilo.
//
// ⚠ O VÍNCULO SAI DOS PROCEDIMENTOS, não de bom senso meu. Cada linha abaixo tem de
// onde veio:
//
//   PO-06 item 7.1 (dimensional de juntas): calibre de desalinhamento, calibre de solda
//     múltiplas funções (padrão FBTS), paquímetro, goniômetro, calibre para abertura da
//     raiz, gabaritos, escala, trena — e o item 6.2 exige luxímetro calibrado.
//   PO-06 item 7.2 (visual): lupa e espelho — não são instrumentos calibrados, não
//     entram no mapa.
//   PO-05 item 5.5.1.1: medidor de perfil de rugosidade tipo agulha deslizante; o
//     formulário exige ainda espessura de película, termohigrômetro e termômetro.
//   PO-15 item 12.1: luxímetro calibrado; item 7: temperatura da superfície
//     (termômetro). A amostra emitida (LP_269_26_T70) usou luxímetro, trena, paquímetro
//     e termômetro.
//   PO-04: não lista instrumentos, mas o modelo do relatório dimensional traz trena,
//     esquadro de aço e paquímetro; o item 5.4.17 (nivelamento) pede nível.
//   PI-QUA-003: aparelho, cabeçote e bloco padrão têm campos PRÓPRIOS no formulário do
//     ultrassom — aqui ficam os de apoio: trena, paquímetro e termômetro.
//
// ⚠ E É FILTRO, NÃO TRAVA. A tela mostra o do procedimento e deixa ver a lista inteira
// com um clique. Uma obra pode exigir um instrumento que o procedimento não previu, e
// bloquear faria o inspetor registrar nada — que é o pior dos casos.

/** Prefixo do código no mapa de calibração (TR 04 → TR, CRS-01 → CRS). */
export function prefixoDoCodigo(codigo) {
  const c = String(codigo || "").trim().toUpperCase();
  const m = c.match(/^([A-Z]+)/);
  return m ? m[1] : null;
}

export const PREFIXOS_POR_TIPO = {
  DIMENSIONAL: ["TR", "ES", "PQ", "NV"],
  VISUAL_SOLDA: ["LX", "CS", "CRS", "S", "CP", "PQ", "TR"],
  ULTRASSOM: ["TR", "PQ", "TM"],
  PINTURA: ["RGT", "MPS", "TH", "TM"],
  LP: ["LX", "TM", "TR", "PQ"],
  // registro geral não tem procedimento que restrinja
  GERAL: null,
};

/** De onde veio a regra — vai na tela, para o inspetor saber por que a lista é essa. */
export const FONTE_POR_TIPO = {
  DIMENSIONAL: "PO-04 e o modelo do relatório",
  VISUAL_SOLDA: "PO-06, itens 6.2 e 7.1",
  ULTRASSOM: "PI-QUA-003 (aparelho e cabeçote têm campo próprio)",
  PINTURA: "PO-05, item 5.5.1.1 e o formulário",
  LP: "PO-15, itens 7 e 12.1",
};

/**
 * Os instrumentos que o procedimento deste relatório prevê.
 * Tipo sem regra (ou instrumento sem código) devolve a lista inteira.
 */
export function instrumentosDoTipo(lista, tipo) {
  const prefixos = PREFIXOS_POR_TIPO[tipo];
  if (!prefixos) return Array.isArray(lista) ? lista : [];
  return (lista || []).filter((e) => {
    const p = prefixoDoCodigo(e.codigo);
    // sem código não dá para classificar — aparece, em vez de sumir sem explicação
    return !p || prefixos.includes(p);
  });
}
