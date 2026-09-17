// ─── A LEITURA DO RESULTADO DE UM SINCRONISMO ────────────────────────────────
//
// Funções PURAS sobre o que `sincronizarPrazos` devolveu. Sem banco, sem rede, sem `server-only`
// — é por isso que este arquivo existe separado: o botão da tela é client component, e importar
// `lib/sincronismo-prazos` de lá arrastaria a cadeia do Omie até um módulo `server-only` e
// quebraria o build da página inteira.

/** Alguma etapa chegou a falar com o Omie? Se não, o intervalo mínimo não foi gasto. */
export const rodouAlgo = ({ entregas, encerrados }) =>
  entregas.estado !== "ocupada" || encerrados.estado !== "ocupada";

/** Deu certo o bastante para a tela tratar como sucesso? */
export const deuCerto = (r) => r.entregas.estado !== "falhou" && r.encerrados.estado !== "falhou";

/** Alguma coisa mudou no banco? É o que separa "pronto" de "nada mudou" na tela. */
export const houveMudanca = ({ entregas, encerrados }) =>
  ((entregas?.sincronizados || 0) + (encerrados?.marcados || 0) + (encerrados?.desmarcados || 0)) > 0;

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/** O que mudou no banco, em palavras. Vazio quando nada mudou. */
function oQueMudou({ entregas, encerrados }) {
  const partes = [];
  if (entregas.sincronizados) partes.push(plural(entregas.sincronizados, "entrega atualizada", "entregas atualizadas"));
  if (encerrados.marcados) partes.push(`${plural(encerrados.marcados, "pedido encerrado", "pedidos encerrados")} no Omie`);
  if (encerrados.desmarcados) partes.push(plural(encerrados.desmarcados, "pedido reaberto", "pedidos reabertos"));
  return partes;
}

/** O que ficou pela metade, em palavras. */
function oQueFalhou({ entregas, encerrados }) {
  const avisos = [];
  if (entregas.estado === "falhou") avisos.push(`entregas: ${entregas.motivo}`);
  if (encerrados.estado === "falhou") avisos.push(`encerrados: ${encerrados.motivo}`);
  if (entregas.estado === "parcial" || encerrados.estado === "parcial") avisos.push("rodada parcial — o resto entra na próxima");
  if (entregas.estado === "ocupada" || encerrados.estado === "ocupada") avisos.push("uma das etapas já estava rodando");
  return avisos;
}

/**
 * A frase que a tela mostra. Mora aqui porque é a leitura do resultado, não desenho.
 *
 * ⚠ "Nada mudou" é resposta legítima e precisa ser dita com todas as letras — sem ela, quem
 * clica e vê a mesma tela conclui que o botão não funciona e clica de novo.
 */
export function resumoDoSincronismo(r) {
  if (!rodouAlgo(r)) return "Já havia uma sincronização em andamento — tente de novo em instantes.";

  const partes = oQueMudou(r);
  const frase = partes.length ? `${partes.join(" · ")}.` : "Nada mudou desde a última sincronização.";

  // ⚠ O aviso vem DEPOIS do que mudou, nunca no lugar: rodada pela metade que atualizou 3
  // entregas atualizou 3 entregas.
  const avisos = oQueFalhou(r);
  return avisos.length ? `${frase} (${avisos.join("; ")})` : frase;
}
