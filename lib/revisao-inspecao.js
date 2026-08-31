import { numeroBR } from "@/lib/numero-br";
// REINSPEÇÃO E REVISÃO DO RELATÓRIO DE INSPEÇÃO.
//
// Vitor (21/08/2026): "no caso de reprova o relatório deve ficar aberto; na reinspeção o inspetor
// abre o relatório que estava reprovado e analisa os pontos destacados que foram reprovados, e
// quando o relatório for aprovado salvar como R01, e se for reprovado novamente nova revisão".
//
// O modelo que sai daí: cada RODADA de inspeção é uma revisão.
//
//   R00  primeira inspeção        → reprovou: o relatório CONTINUA ABERTO
//   R01  reinspeção após reparo   → aprovou: fecha em R01
//   R02  reinspeção seguinte      → e assim por diante
//
// ⚠ A rodada anterior é CONGELADA, não sobrescrita. O que se mediu antes do reparo é evidência: é
// ela que mostra que a peça foi reprovada, reparada e reinspecionada — e é o que um auditor pede
// quando pergunta por que uma peça foi retrabalhada. Perder isso ao regravar seria apagar o próprio
// motivo da revisão existir.

// ⚠ SEM `server-only`: este módulo é só regra e não toca em banco nem em rede, e as telas do
// celular e do computador precisam das mesmas constantes. Marcá-lo como servidor obrigaria a
// duplicar os rótulos no cliente — e rótulo duplicado é rótulo que diverge.

export const RESULTADOS = ["APROVADO", "REPROVADO", "REC"];

export const RESULTADO_LABEL = {
  APROVADO: "Aprovado",
  REPROVADO: "Reprovado",
  REC: "Recomendação de exame complementar",
};

/** "R00", "R01"… — como a Qualidade escreve a revisão. */
export const rotuloRevisao = (n) => `R${String(n ?? 0).padStart(2, "0")}`;

/**
 * O relatório está fechado?
 *
 * ⚠ Só APROVADO fecha. Reprovado e "exame complementar" mantêm aberto — no primeiro porque a peça
 * volta para reparo, no segundo porque o ensaio ainda vai acontecer. Fechar num deles faria o
 * relatório sair para assinatura dizendo que a inspeção terminou quando não terminou.
 */
export const estaFechado = (rel) => rel?.resultadoInspecao === "APROVADO";

/**
 * Quais linhas foram reprovadas na rodada — as que a reinspeção precisa olhar.
 *
 * ⚠ Vale para os dois tipos de relatório, com regras diferentes: no ensaio visual o julgamento é o
 * campo `laudo` da junta; no dimensional é a medida fora da tolerância, que ninguém marca — se
 * calcula.
 */
export function linhasReprovadas(linhas) {
  return (Array.isArray(linhas) ? linhas : []).reduce((out, l, i) => {
    if (l?.laudo && String(l.laudo).toUpperCase().startsWith("R")) { out.push(i); return out; }
    if (l?.encontradoMm != null && l?.projetoMm != null) {
      const tol = numeroBR(String(l.tolerancia || "").replace(/[^\d.,]/g, ""), NaN);
      if (Number.isFinite(tol) && Math.abs(Number(l.encontradoMm) - Number(l.projetoMm)) > tol) out.push(i);
    }
    return out;
  }, []);
}

/**
 * Abre a próxima revisão: congela a rodada atual e devolve o que gravar.
 *
 * ⚠ As MEDIDAS da rodada anterior são limpas, mas as linhas ficam. Reinspeção é medir de novo — o
 * valor velho ao lado do campo faria alguém confirmar sem medir, que é o oposto do que a revisão
 * existe para provar. O que foi medido antes continua guardado em `revisoes`.
 */
export function proximaRevisao(rel, { por = null } = {}) {
  const linhas = Array.isArray(rel.linhas) ? rel.linhas : [];
  const anteriores = Array.isArray(rel.revisoes) ? rel.revisoes : [];
  const reprovadas = linhasReprovadas(linhas);

  const congelada = {
    revisao: rel.revisao ?? 0,
    rotulo: rotuloRevisao(rel.revisao ?? 0),
    resultadoInspecao: rel.resultadoInspecao || null,
    linhas,
    resultados: rel.resultados || null,
    inspetor: rel.inspetor || null,
    reprovadas,
    emEm: new Date().toISOString(),
    por,
  };

  return {
    revisao: (rel.revisao ?? 0) + 1,
    resultadoInspecao: null,
    revisoes: [...anteriores, congelada],
    linhas: linhas.map((l, i) => ({
      ...l,
      encontradoMm: null,
      laudo: null,
      descontinuidade: null,
      // ⚠ o que reprovou na rodada anterior fica MARCADO na linha: é o que a tela destaca para o
      // inspetor olhar primeiro, sem ele precisar comparar dois documentos.
      reprovouAntes: reprovadas.includes(i) || undefined,
    })),
  };
}
