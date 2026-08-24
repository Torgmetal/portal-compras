// OBRA do Syneco → número da OP no portal.
//
// O SKA escreve a obra com prefixo T (T64, T104A, T60B) e o portal guarda o número com zero à
// esquerda (064, 104, 060). Esta conversão é o ÚNICO vínculo entre o apontamento e a OP: sem ela o
// registro entra com `opId: null` e some do portal — o dado existe no banco e não aparece em lugar
// nenhum.
//
// 🚨 Foi o que aconteceu com a **OP-092**: alguém cadastrou a obra no Syneco como **"OP-92"** em vez
// de "T92". Como a regra só entendia `^T`, ficaram **1.063 ordens e 618 apontamentos órfãos
// (126.290 kg produzidos)** — e a OP aparecia em TODAS as raias da TV com 48–77%, porque o portal
// achava que nada tinha sido produzido e calculava o progresso pelo `status` velho das peças.
// (Vitor 19/08: "a 92, mesmo ela tendo passado por todos os setores, ela aparece lá ainda?")
//
// ⚠️ A regra é estreita de propósito. Varri as 39 obras órfãs da base: só a "OP-92" casa com OP do
// portal. As outras (T36, T50, T68…) são obras antigas que nunca foram cadastradas — órfãs
// legítimas. "ALM-T29" (almoxarifado) e "TORG METAL" não podem virar OP nenhuma, e não viram: o
// prefixo tem de estar no COMEÇO.

export function obraParaNumeroOP(obra) {
  if (!obra) return obra;
  const s = String(obra).trim();
  const m = s.match(/^T(\d+)/i) || s.match(/^OP[-\s_]?0*(\d+)/i);
  return m ? String(parseInt(m[1], 10)).padStart(3, "0") : s;
}

// ⚠⚠ O NÚMERO DA OP PODE TER SUFIXO — e foi assim que a OP-036-01 ficou invisível.
// Vitor (23/08/2026), no pente-fino: a obra T36 produz desde junho, tem 14.021 ordens no Syneco, e
// NENHUMA delas casa com OP nenhuma. `obraParaNumeroOP("T36")` devolve `"036"`; a OP se chama
// `"036-01"`. Os dois lugares que montavam o mapa buscavam com `numero: { in: [...] }` — igualdade
// exata — então a OP existia, estava ABERTA, vencida desde 31/07, e o portal achava que ela não
// tinha produção nenhuma: fora da TV de prioridades, do PMP, da carga do corte, de tudo.
//
// ⚠ O comentário acima ainda diz que "T36 é obra antiga que nunca foi cadastrada". Era verdade
// quando foi escrito; deixou de ser em 19/06/2026, quando a OP-036-01 nasceu. Por isso a resolução
// passa a ser por PREFIXO, feita num lugar só, em vez de cada chamador montar o seu mapa.
//
// ⚠ EXATO GANHA DE PREFIXO: se existir uma OP "036" e outra "036-01", a obra T36 vai para a "036".
// Sufixo é desempate, não atalho.

/**
 * Mapa obra do Syneco → OP do portal, tolerando sufixo no número ("036" acha "036-01").
 * @param {*} db cliente Prisma (aceita o direto, usado pelo sync)
 * @param {string[]} obras nomes de obra vindos do Syneco
 * @param {object} select campos da OP a trazer
 * @param {Date}   desde  início do período em tela — corta casamento por sufixo anterior à OP
 */
export async function mapaObraParaOP(db, obras, select = { id: true, numero: true }, desde = null) {
  const unicas = [...new Set((obras || []).filter(Boolean))];
  const numeros = [...new Set(unicas.map(obraParaNumeroOP))];
  if (!numeros.length) return {};

  const ops = await db.oP.findMany({
    where: { OR: numeros.map((n) => ({ numero: { startsWith: n } })) },
    select: { ...select, numero: true, dataInicio: true },
  });
  return mapaObraParaOPDeLista(ops, unicas, desde);
}

/**
 * Mesma regra, sobre uma lista de OPs já carregada (telas que buscam as OPs por outro motivo).
 * ⚠ a regra do sufixo mora AQUI e em nenhum outro lugar — a tela /producao/mes tinha a sua própria
 * versão, com o resultado de a mesma página listar T36 em "não iniciadas" (onde o parseInt casava)
 * e sem OP na tabela (onde a igualdade exata não casava).
 */
export function mapaObraParaOPDeLista(ops, obras, desde = null) {
  const mapa = {};
  for (const obra of [...new Set((obras || []).filter(Boolean))]) {
    const base = obraParaNumeroOP(obra);
    const candidatas = (ops || []).filter((o) => o.numero === base || String(o.numero || "").startsWith(`${base}-`));
    // exato primeiro; entre sufixadas, a de menor sufixo (036-01 antes de 036-02)
    const escolhida = candidatas.find((o) => o.numero === base)
      || candidatas.sort((a, b) => a.numero.localeCompare(b.numero, "pt-BR", { numeric: true }))[0];
    const porSufixo = escolhida && escolhida.numero !== base;
    // ⚠ tela com período: casamento por sufixo só vale a partir da abertura da OP — ver opIdDaLinha.
    const foraDoPeriodo = porSufixo && desde && escolhida.dataInicio && new Date(desde) < new Date(escolhida.dataInicio);
    mapa[obra] = escolhida && !foraDoPeriodo ? { ...escolhida, porSufixo } : null;
  }
  return mapa;
}

// ⚠⚠ CASAR PELO SUFIXO NÃO PODE ADOTAR A HISTÓRIA DA OBRA INTEIRA.
// Medido em 24/08/2026: a obra T36 tem 915.767 kg no Syneco — CONTRAVENTAMENTO, VIGA EL. +3000,
// FRECHAL: um galpão, produzido entre jul e nov/2025. A OP-036-01 é outra coisa: "Linha de Vida"
// da Danpower, aberta em 19/06/2026, prazo 31/07, ZERO peças cadastradas, e o que a fábrica
// apontou em T36 de junho para cá são 7 toneladas — o tamanho de uma linha de vida.
//
// Ou seja: o número base 36 é compartilhado por dois contratos. O portal só registrou o segundo.
// Casar por prefixo sem olhar a data jogaria 915 t de galpão dentro de uma OP de 7 t e estragaria
// tudo que lê peso por OP (Saúde Financeira, Status da Obra, cronograma, indicadores).
//
// ⚠ a data só arbitra quando o casamento é INEXATO. Número igual é a mesma obra, ponto — e nesse
// caso a produção anterior à abertura é normal (a OP costuma ser cadastrada depois que a fábrica
// já começou). O corte por data vale só para o sufixo, que é justamente o caso ambíguo.
//
// ⚠ sem data (ordem "Não Inicializada") não entra: se ainda não produziu, não há o que atribuir,
// e chutar a OP errada só polui o planejamento dela.
export function opIdDaLinha(mapa, obra, data) {
  const op = mapa?.[obra];
  if (!op) return null;
  if (!op.porSufixo) return op.id;
  if (!data || !op.dataInicio) return null;
  return new Date(data) >= new Date(op.dataInicio) ? op.id : null;
}
