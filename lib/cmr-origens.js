// ─── DE ONDE VEM UMA ENTRADA DO CMR ───────────────────────────────────────────
// ⚠⚠ SÃO DUAS, E ESQUECER A SEGUNDA APAGA A ENTRADA DA VISTA. Descoberto em 01/09/2026 montando a
// §04 do Data Book da OP-112: sete R apareciam como `R 261282 | — | — |`, sem material, corrida nem
// certificado — com tudo preenchido no banco.
//
// A causa: o CMR é escrito por DOIS caminhos. O import da planilha grava `importacao_planilha`
// (3.725 entradas) e a reconciliação automática — `cmr-reconciliar`, o cron das 5h40 — grava
// `planilha_sharepoint` (130 entradas, em 19 obras). Os leitores filtravam só o primeiro.
//
// ⚠ O ESTRAGO ERA DUPLO. Além de sumir da §04, a entrada também ficava fora do casamento de PDFs:
// o certificado escaneado nunca colaria nela, e ninguém entenderia por quê — a leitura seria
// "o Almoxarifado não digitalizou", quando o arquivo poderia estar lá.
//
// Usar SEMPRE esta constante ao ler o CMR. Ao escrever, cada rotina segue com a sua origem: a
// diferença é informação de procedência e vale a pena manter.
export const ORIGENS_CMR = ["importacao_planilha", "planilha_sharepoint"];

/** Fragmento de `where` do Prisma para "é uma entrada do CMR, venha de onde vier". */
export const DO_CMR = { origem: { in: ORIGENS_CMR } };
