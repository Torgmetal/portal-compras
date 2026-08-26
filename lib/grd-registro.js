import "server-only";

// ─── UMA IMPRESSÃO, UMA LINHA NO HISTÓRICO ────────────────────────────────────
// Vitor (26/08/2026): "garanta que está sendo registradas copias que foram impressas novamente não
// estou vendo esse registro dessas copias".
//
// A GRD guardava `impressoes` (quantas) e `ultimaImpressaoEm` (quando foi a última). Quem tirou a
// 2ª via, em que dia, e com qual R carimbado não ficava em lugar nenhum — e é exatamente isso que
// uma Guia de Remessa de Documentos existe para provar. Reimprimir continua somando na MESMA GRD
// (regra do Vitor, 19/08); o que muda é que cada cópia deixa rastro.
//
// ⚠ TETO DE 200 ENTRADAS: histórico é prova, não log infinito — e um Json que cresce sem limite
// acaba travando a linha. Guarda-se a primeira (a original) e as últimas.
const TETO = 200;

export function novaEntradaGrd({ anterior, quando, usuario, itemId, itens }) {
  const rs = [...new Set((Array.isArray(itens) ? itens : [])
    .flatMap((i) => (i.usadas || []).map((u) => u.rastreio)).filter(Boolean))];
  const entrada = {
    em: (quando || new Date()).toISOString(),
    por: usuario || null,
    itemId: itemId || null,
    rs,
  };
  const hist = Array.isArray(anterior) ? anterior : [];
  const junto = [...hist, entrada];
  return junto.length <= TETO ? junto : [junto[0], ...junto.slice(-(TETO - 1))];
}
