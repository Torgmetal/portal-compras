// ─── A LISTA DO POSTO, CURTA O BASTANTE PARA SER LIDA ────────────────────────
//
// ⚠⚠ A CAPTURA DA TELA INTEIRA DEU **70.360 px** (Laser Cantoneira, 13/09/2026) — 730 marcas de
// backlog empilhadas num monitor de chão de fábrica. A fila da máquina é o backlog inteiro de
// propósito (`lib/mes/programado.js`: *"atrasado continua sendo trabalho"*), mas despejar tudo de
// uma vez é a mesma coisa que não mostrar nada: ninguém rola 70 mil pixels de luva.
//
// Três regras, nesta ordem:
//   1. **marca concluída vai para o fim** — ela não é trabalho, é histórico;
//   2. **a obra com trabalho pendente vem antes** da que já acabou;
//   3. **só as primeiras aparecem**; o resto fica atrás de um toque, e a busca continua achando
//      qualquer uma (o leitor de código não depende desta lista).

export const QUANTAS = 12;

/** Obras com pendência primeiro; dentro de cada uma, o que falta antes do que já saiu. */
export function ordenarLotes(lotes = []) {
  return [...lotes]
    .map((lote) => ({ ...lote, marcas: ordenarMarcas(lote.marcas || []) }))
    .sort((a, b) => pendentes(b) - pendentes(a) || String(a.opNumero).localeCompare(String(b.opNumero)));
}

const ordenarMarcas = (marcas) =>
  [...marcas].sort((a, b) => Number(Boolean(a.concluida)) - Number(Boolean(b.concluida)));

const pendentes = (lote) => (lote.marcas || []).filter((m) => !m.concluida).length;

/**
 * ⚠ O CORTE É POR OBRA, não pela lista toda: cortando o total, a segunda obra sumiria inteira e o
 * operador acharia que ela não está programada. Cada obra mostra as suas primeiras.
 */
export const visiveis = (marcas, tudo) => (tudo ? marcas : marcas.slice(0, QUANTAS));
