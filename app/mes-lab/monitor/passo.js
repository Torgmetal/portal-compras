// ⚠ O RECUO NO ERRO EXISTE PARA A QUEDA NÃO VIRAR ENXURRADA. Uma TV que perde a rede às 19h
// continuaria batendo na porta a cada 10 segundos até de manhã — e quando o servidor for a causa da
// falha, isso é bater em quem já está caído. O passo dobra a cada erro, até 2 minutos.

export const PASSO_MS = 10_000;
const TETO_MS = 120_000;

export const proximoPasso = (erros = 0) =>
  erros <= 0 ? PASSO_MS : Math.min(PASSO_MS * 2 ** erros, TETO_MS);
