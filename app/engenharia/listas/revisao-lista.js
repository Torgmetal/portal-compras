// A ABA "REVISÃO" DO ARQUIVO ARQUIVADO — o recibo que vai junto com a lista no servidor.
//
// Fica fora da tela porque é regra, não interface: o que o import previu, o que ele gravou, e o
// aviso quando os dois discordam. `ListasClient.jsx` só desenha.

// Monta a aba "Revisão" (AoA) que vai embutida no xlsx salvo no servidor.
/**
 * O QUE O IMPORT PREVIU × O QUE ELE GRAVOU — e o aviso quando os dois discordam.
 *
 * ⚠⚠ ESTA ABA JÁ MENTIU, E O PAPEL CIRCULOU COMO VERDADE. A LE R01 da OP-102, importada em
 * 13/08/2026, saiu gravada aqui como "18 incluídas" — e NENHUMA das 18 entrou no banco. O `diff` é
 * calculado ANTES da gravação: é uma PREVISÃO ("estas 18 não existem hoje"), não um recibo. Quem
 * abriu o arquivo depois leu 18 incluídas e foi dormir tranquilo; a divergência só apareceu quatro
 * semanas depois, quando a tela de etiquetas mostrou 71 marcas numa lista de 77.
 *
 * Por isso o resumo agora tem DUAS linhas com nomes diferentes — "Previsto" e "Gravado" — e uma
 * terceira que só existe quando eles não batem. `criados`/`atualizados`/`ignorados` vêm da rota e
 * são o que de fato foi ao banco.
 */
export function montarAbaRevisao({ sigla, j, revLabel, sobrescrever = false }) {
  const d = j.diff || {};
  const nome = sigla === "LPC" ? "Lista de Peças por Conjunto (LPC)" : "Lista de Expedição (LE)";
  const previu = d.nIncluidas || 0;
  const alerta = divergencia(j, sobrescrever);

  return [
    ["REVISÃO DA LISTA"],
    ["Tipo", nome],
    ["OP", j.opNumero || ""],
    ["Obra", j.obra || ""],
    ["Revisão", revLabel || ""],
    ["Importado em", new Date().toLocaleString("pt-BR")],
    [],
    ["Modo", sobrescrever ? "SOBRESCREVER (a lista anterior foi apagada e regravada)" : "Complementar (nada foi apagado)"],
    ["Previsto (antes de gravar)",
      `${previu} a incluir · ${d.nRemovidas || 0} a remover · ${d.nAlteradas || 0} a alterar`],
    ["Gravado (o que foi ao banco)",
      `${Number(j.criados) || 0} criadas · ${Number(j.atualizados) || 0} atualizadas · ` +
      `${Number(j.ignorados) || 0} ignoradas` +
      (j.totalNoArquivo ? ` (de ${j.totalNoArquivo} no arquivo)` : "")],
    ...(alerta ? [["⚠ ATENÇÃO", alerta]] : []),
    [],
    ["Marca", "Situação (previsão)", "Peso anterior (kg)", "Peso novo (kg)"],
    ...(d.incluidas || []).map((x) => [x.marca, "INCLUÍDA", "", x.peso]),
    ...(d.alteradas || []).map((x) => [x.marca, "ALTERADA", x.de, x.para]),
    ...(d.removidas || []).map((x) => [x.marca, "REMOVIDA", x.peso, ""]),
  ];
}

/**
 * A frase que explica a divergência, ou vazio quando o import fez o que devia.
 *
 * ⚠⚠ O ESPERADO DEPENDE DO MODO, E ERRAR ISSO É PIOR QUE NÃO AVISAR. Com **sobrescrever** a rota
 * APAGA a lista anterior e recria tudo, então o certo é `criados == totalNoArquivo` — comparar com
 * a previsão daria "gravou mais do que o previsto" num import perfeito (a previsão foi calculada
 * contra as linhas que a própria rota ia apagar em seguida). Alarme falso em ferramenta de alarme
 * é pior que silêncio: ensina a ignorar a tarja.
 *
 * ⚠ "REMOVIDA" não é comparada com nada de propósito: SEM sobrescrever o import não apaga, e a
 * lista de removidas é só o aviso de que aquelas marcas saíram do arquivo. Cobrar remoção aqui
 * marcaria como defeito o comportamento normal.
 */
export function alertaDeDivergencia({ previu, criou, ignorou, jaNaOutraLista, sobrescrever, totalNoArquivo }) {
  const partes = [];
  const esperado = sobrescrever ? (Number(totalNoArquivo) || 0) : previu;
  const comoEsperava = sobrescrever
    ? `a lista inteira do arquivo (${esperado} marca(s))`
    : `${esperado} marca(s) nova(s)`;
  if (esperado !== criou) {
    partes.push(`o import deveria gravar ${comoEsperava} e gravou ${criou}` +
      (criou < esperado ? ` — ${esperado - criou} NÃO entrou(aram) no portal` : " — mais do que o esperado"));
  }
  if (ignorou > 0) partes.push(`${ignorou} linha(s) do arquivo foram ignoradas`);
  if (jaNaOutraLista?.length) {
    partes.push(`${jaNaOutraLista.length} marca(s) já existiam nesta OP pela outra lista: ` +
      jaNaOutraLista.slice(0, 20).join(", ") + (jaNaOutraLista.length > 20 ? "…" : ""));
  }
  if (!partes.length) return "";
  return partes.join(". ") + ". Confira a lista no portal antes de tratar este arquivo como vigente.";
}

/** O mesmo aviso, lido direto da resposta do import — para a tela e para a aba. */
export const divergencia = (r, sobrescrever = false) => alertaDeDivergencia({
  previu: r?.diff?.nIncluidas || 0,
  criou: Number(r?.criados) || 0,
  ignorou: Number(r?.ignorados) || 0,
  jaNaOutraLista: r?.jaNaOutraLista,
  totalNoArquivo: r?.totalNoArquivo,
  sobrescrever,
});
