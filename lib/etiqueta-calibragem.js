import "server-only";

// CALIBRAGEM DA IMPRESSORA DE ETIQUETAS — quanto o desenho precisa andar para cair no adesivo.
//
// ⚠⚠ CONSERTO DE MÁQUINA, NÃO DESIGN. O PDF desenha de 1,2 a 98,8 mm numa página de 100: está
// centrado. Se sai cortado, a origem de impressão da Argox está deslocada, e o lugar certo de
// corrigir é o driver — está escrito na tela. Isto existe porque o driver da Argox nem sempre expõe
// esse ajuste, e sem ele a expedição fica sem saída nenhuma.
//
// ⚠ Mora aqui, e não no `route.js`, porque DUAS rotas precisam: a que grava e a que imprime.
// Importar um route handler de outro é frágil — o Next trata esses arquivos como pontos de entrada.

export const CHAVE_ARGOX = "argox";

/**
 * ⚠ O TETO É O QUE O PAPEL AGUENTA. Acima de 10 mm o desenho encolheria mais de 10% e a etiqueta
 * sairia visivelmente menor que o adesivo — a essa altura o problema é o driver ou a mídia.
 */
export const LIMITE_MM = 10;

export const emMilimetros = (v) => {
  // Aceita vírgula: quem digita "1,5" no Brasil não está errado.
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? Math.max(-LIMITE_MM, Math.min(LIMITE_MM, n)) : 0;
};

/** Sem linha no banco a calibragem é ZERO — que é o desenho como foi projetado. */
export async function lerCalibragem(prisma) {
  const linha = await prisma.etiquetaCalibragem
    .findUnique({ where: { id: CHAVE_ARGOX } })
    // ⚠ Tabela ausente (deploy antigo) não pode derrubar a impressão: cai em zero, que é o
    // comportamento de sempre. Etiqueta levemente torta é melhor que etiqueta nenhuma.
    .catch(() => null);
  return { deslocX: linha?.deslocX || 0, deslocY: linha?.deslocY || 0 };
}
