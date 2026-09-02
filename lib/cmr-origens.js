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

// ─── A ORDEM DO FIFO ──────────────────────────────────────────────────────────
// ⚠⚠ DUAS TELAS DIZIAM R DIFERENTE PARA O MESMO MATERIAL. Vitor (02/09/2026): "na OP-113 temos um
// W150x37,1, o R informado na página do PCP é o R261284 e na planilha de separação está o R261285".
//
// As duas entradas são do MESMO material, MESMA corrida (2715610833), MESMA NF (45593) e MESMO dia
// (26/08) — dois fardos do mesmo lote, de 445 e 222 kg. Ninguém estava errado: o FIFO ordena por
// `dataRecebimento` e, no empate, cada leitor caía num lado.
//
//   · lib/material-liberacao.js (PCP/Planejamento) lia o CMR em `asc` → pegava o 261284
//   · app/api/pcp/separacao (a planilha) lia em `desc` e depois reordenava por data com
//     `localeCompare`, que devolve 0 no empate — e `sort` estável preserva a ordem recebida, ou
//     seja, a descendente → 261285
//
// Empate não é raro: são **221 grupos** de OP + material + data com duas ou mais entradas (a OP-008
// tem 15 chapas iguais no mesmo dia). E sem desempate explícito nem o Postgres garante ordem entre
// iguais, então dois leitores em `asc` também podem divergir um do outro.
//
// O desempate é o PRÓPRIO R: ele é o índice sequencial do CMR, então o número menor foi registrado
// antes — é o mais antigo dos dois, que é exatamente o que o FIFO quer. Seis dígitos sempre
// (250001…261335, zero não numéricos), então ordem de texto = ordem numérica.
//
// Usar SEMPRE isto ao percorrer o CMR em FIFO — os três motores (rastreio da peça, liberação de
// material e planilha de separação) precisam chegar no mesmo fardo, senão o carimbo da peça e o
// papel do Almoxarifado apontam para fardos diferentes.
export const ORDEM_FIFO_CMR = [{ dataRecebimento: "asc" }, { importRef: "asc" }];

/** Mesma ordem do FIFO, para listas já carregadas. Aceita {dataRecebimento|recebidoEm, importRef|rastreio}. */
export function compararFifoCmr(a, b) {
  const dt = (x) => String(x?.dataRecebimento ? new Date(x.dataRecebimento).toISOString().slice(0, 10) : x?.recebidoEm || "").slice(0, 10);
  const r = (x) => String(x?.importRef ?? x?.rastreio ?? "");
  return dt(a).localeCompare(dt(b)) || r(a).localeCompare(r(b));
}
