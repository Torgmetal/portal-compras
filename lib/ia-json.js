// ─── O JSON QUE A IA DEVOLVE, E O QUE FAZER QUANDO ELE VEM CORTADO ─────────────
//
// ⚠⚠ O CASO REAL (11/09/2026). Matheus, lançando a proposta de um fornecedor: *"deu erro para
// importar um PDF grande para a IA preencher a cotação — Falha ao processar: IA devolveu resposta
// não-JSON. Provável ruído na extração."*
//
// ⚠⚠ "RUÍDO NA EXTRAÇÃO" É A EXPLICAÇÃO ERRADA, E ELA CUSTOU A INVESTIGAÇÃO. A mensagem manda
// procurar defeito no PDF — qualidade de digitalização, texto sujo. Mas a resposta da IA não é
// ruidosa: ela é **completa até certo ponto e cortada no meio**, porque o documento grande gera
// mais itens do que cabem no teto de tokens de saída. O modelo para no meio de um item e o
// `JSON.parse` quebra. O sintoma é idêntico ao de lixo; a causa e o conserto, opostos.
//
// ⚠⚠ E O PIOR DE TUDO É JOGAR FORA O QUE FOI LIDO. Numa proposta de cem linhas, cortar no item 93
// devolvia ZERO — o comprador digitava as cem à mão. Os 92 itens completos estão ali, íntegros,
// antes do corte: o que falta não é dado, é um `]` e um `}`.

/**
 * O bloco JSON dentro da resposta — `<json>…</json>` se existir, senão do primeiro `{` ao último `}`.
 */
export function extrairJson(texto) {
  const marcado = String(texto ?? "").match(/<json>([\s\S]*?)<\/json>/i);
  if (marcado) return marcado[1].trim();
  const s = String(texto ?? "");
  const ini = s.indexOf("{");
  const fim = s.lastIndexOf("}");
  return ini >= 0 && fim > ini ? s.substring(ini, fim + 1) : s;
}

/**
 * Percorre um objeto JSON a partir de `ini` e devolve onde ele fecha, ou -1 se não fecha.
 *
 * ⚠ PRECISA ENTENDER STRING E ESCAPE. Contar `{` e `}` cru quebra na primeira descrição de material
 * que tenha chave — e descrição de proposta é texto livre do fornecedor, então mais cedo ou mais
 * tarde tem. Aspas escapadas (`\"`) idem: sem tratar a barra, o scanner acha que a string fechou.
 */
function fimDoObjeto(s, ini) {
  let prof = 0, emString = false, escapado = false;
  for (let i = ini; i < s.length; i++) {
    const c = s[i];
    if (emString) {
      if (escapado) escapado = false;
      else if (c === "\\") escapado = true;
      else if (c === '"') emString = false;
      continue;
    }
    if (c === '"') emString = true;
    else if (c === "{") prof++;
    else if (c === "}") { prof--; if (prof === 0) return i; }
  }
  return -1;
}

/** Os objetos `{…}` que FECHARAM a partir de `ini` — o interrompido fica de fora. */
function objetosCompletos(s, ini) {
  const out = [];
  let i = ini;
  while (i < s.length) {
    const abre = s.indexOf("{", i);
    if (abre < 0) break;
    const fecha = fimDoObjeto(s, abre);
    if (fecha < 0) break;              // item cortado no meio — para aqui
    out.push(s.slice(abre, fecha + 1));
    i = fecha + 1;
  }
  return out;
}

/**
 * RECUPERA O QUE DEU PARA LER de uma resposta cortada no meio.
 *
 * Reconstrói um JSON válido com o cabeçalho da proposta e SÓ os itens que fecharam — o item
 * interrompido é descartado inteiro, nunca completado por conta própria.
 *
 * ⚠⚠ ITEM PELA METADE NÃO É ITEM. Aproveitar o último objeto truncado (preenchendo o que faltou com
 * null) produziria uma linha com preço e sem quantidade, ou o contrário — e preço errado vira pedido
 * de compra errado, que é a coisa que o prompt inteiro desta rota existe para evitar.
 *
 * @param {string} texto resposta crua da IA
 * @returns {{ objeto: object, itens: number } | null} null = não deu para recuperar nada
 */
export function recuperarJsonTruncado(texto) {
  const s = extrairJson(texto);
  const mArr = s.match(/"itens"\s*:\s*\[/);
  if (!mArr) return null;
  const inicioArr = mArr.index + mArr[0].length;

  const itens = objetosCompletos(s, inicioArr);
  if (!itens.length) return null;

  const cabecalho = s.slice(0, mArr.index);
  try {
    const objeto = JSON.parse(`${cabecalho}"itens":[${itens.join(",")}]}`);
    return { objeto, itens: itens.length };
  } catch {
    // ⚠ O cabeçalho também pode estar quebrado (raro, mas possível se a IA errou antes dos itens).
    // Aí devolve só os itens: eles é que são o trabalho.
    try {
      return { objeto: { itens: JSON.parse(`[${itens.join(",")}]`) }, itens: itens.length };
    } catch { return null; }
  }
}

/**
 * A EXPLICAÇÃO HONESTA DA FALHA — a que manda a pessoa para o lugar certo.
 *
 * ⚠ `stop_reason: "max_tokens"` é a resposta batendo no teto de saída; não tem nada a ver com a
 * qualidade do PDF. Dizer "ruído na extração" aqui manda o comprador reescanear um documento que
 * está perfeito.
 *
 * @param {{stopReason?:string|null, texto?:string}} _
 */
export function motivoDaFalhaIA({ stopReason, texto } = {}) {
  if (stopReason === "max_tokens") {
    return "A proposta é grande demais e a leitura foi cortada no meio. Tente enviar em partes (ou confira os itens que vieram).";
  }
  if (!String(texto ?? "").trim()) {
    return "A leitura automática não devolveu nada. Tente de novo em instantes.";
  }
  return "Não consegui entender a resposta da leitura automática. Confira se o arquivo é mesmo a proposta.";
}
