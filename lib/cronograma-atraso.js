// Atraso de tarefa do cronograma — UMA regra, para a linha e para o contador do setor.
import { hojeBRT, diaBRT } from "@/lib/data-br";

/* ⚠⚠ PRAZO É O DIA INTEIRO, NÃO A MEIA-NOITE. A conta era `new Date(dataFimPrevista) < new Date()`:
   comparava uma data-só (gravada às 00:00 UTC) com o INSTANTE atual, então toda etapa que vence
   HOJE nascia vermelha às 00h01 — atraso que não existe. Vitor (07/09/2026): "os atrasos que marcou
   não podem aparecer pois não é real". Compara-se DIA com DIA.

   ⚠ O dia da data prevista sai em UTC, de propósito. Esses campos são data-só gravada à meia-noite
   UTC; lidos no fuso de Brasília devolvem o dia ANTERIOR (07/09 00:00Z = 06/09 21h em BRT), e a
   etapa apareceria vencida um dia antes — o mesmo bug com outra roupa. Já o HOJE é o de Brasília,
   que é onde a fábrica está. */

/** O dia de HOJE a partir do relógio da tela. ⚠ `now` é um INSTANTE, e instante se lê em Brasília:
    pelo dia UTC, das 21h em diante já seria o dia seguinte e tudo venceria uma noite antes. */
export const diaDeHoje = (agora) => diaBRT(agora || new Date());

/** Dia "YYYY-MM-DD" de um campo data-só do cronograma. */
export const diaPrevisto = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

/** Atrasada = não fechou 100% e o dia previsto JÁ PASSOU (vencer hoje ainda está no prazo). */
export function tarefaAtrasada(t, hoje = hojeBRT()) {
  const dia = diaPrevisto(t?.dataFimPrevista);
  return !!dia && dia < hoje && (t?.percentualRealizado ?? 0) < 100;
}

/** Dias de atraso, 0 quando está no prazo. Datas em "YYYY-MM-DD". */
export function diasDeAtraso(diaPrev, diaEfetivo) {
  if (!diaPrev || !diaEfetivo || diaEfetivo <= diaPrev) return 0;
  return Math.round((Date.parse(`${diaEfetivo}T00:00:00Z`) - Date.parse(`${diaPrev}T00:00:00Z`)) / 86400000);
}
