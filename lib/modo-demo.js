// ─── AMBIENTE DE DEMONSTRAÇÃO ────────────────────────────────────────────────────────────────
//
// Vitor (21/09/2026): "precisamos fazer um localhost para simular essa OP, desde a geração da OP
// até a expedição, para mostrarmos ao cliente — uma OP fake só para eu passar tudo com eles e ir
// ajustando".
//
// ⚠⚠ NÃO EXISTE STAGING: o `npm run dev` grava no banco de PRODUÇÃO e fala com Omie, Resend e
// SharePoint de verdade. Uma OP fake ali ficaria misturada com as reais, mandaria e-mail de cotação
// a fornecedor e abriria pedido no ERP. O modo demo é uma variável só (`MODO_DEMO=1`, no
// `.env.demo`), lida em três fronteiras:
//   - e-mail (`lib/email.js`): não sai, devolve ok e `demo: true`;
//   - Omie (`lib/omie-call.js`, `criarPedidoOmie`): leitura recusada com mensagem clara; o pedido
//     de compra "nasce" com número DEMO-… para a tela seguir até o fim;
//   - SharePoint (`lib/sharepoint.js`): toda GRAVAÇÃO vai para a pasta `DEMO/…` do drive, nunca
//     para a pasta real da obra (leitura continua normal — os desenhos aparecem).
// O banco vem do `DATABASE_URL` do `.env.demo` (Postgres local `torg_demo`, cópia da produção).
// Fora do modo demo nada disto existe: `emModoDemo()` é falso e cada função devolve o que sempre
// devolveu.

export function emModoDemo() {
  return process.env.MODO_DEMO === "1";
}

/** Raiz do drive onde a demo grava — só para não confundir com a pasta real de uma obra. */
export const PASTA_DEMO = "DEMO";

/** O caminho de gravação no SharePoint, desviado para `DEMO/…` quando em demo. Idempotente. */
export function pastaDeGravacao(folderPath) {
  const limpo = String(folderPath || "").replace(/^\/+/, "");
  if (!emModoDemo()) return limpo;
  if (limpo === PASTA_DEMO || limpo.startsWith(`${PASTA_DEMO}/`)) return limpo;
  return `${PASTA_DEMO}/${limpo}`;
}

export const MENSAGEM_OMIE_DEMO = "Integração com o Omie desligada no ambiente de demonstração.";
