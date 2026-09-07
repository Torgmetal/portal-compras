// ─── QUE COR ESTA PEÇA VAI RECEBER ─────────────────────
//
// Vitor (07/09/2026): "você consegue já puxar pelo tipo da estrutura a cor que ela será pintada?".
//
// O PLP guarda as cores POR TIPO DE ESTRUTURA, não por demão — na OP-067 o mesmo sistema pinta
// "PLATAFORMAS E ESCADAS" de PRETO N1 e "GUARDA-CORPO E ESCADAS MARINHEIRO" de AMARELO 5Y 8/12.
// A peça, por sua vez, traz a descrição da LPC ("G.C. INCLINADO", "COLUNA", "MÃO FRANCESA"). Casar
// as duas é o que põe a cor certa na folha do pintor.
//
// ⚠⚠ NA DÚVIDA NÃO CHUTA. Peça pintada da cor errada é retrabalho ou sucata — e o erro só aparece
// depois de curar. Quando a descrição não casa com nenhum tipo, ou casa com MAIS DE UM, a resposta
// é "definir", nunca a primeira cor da lista.
//
// ⚠ "ESCADAS" APARECE NOS DOIS TIPOS da OP-067. Uma peça descrita só como "ESCADA" é genuinamente
// ambígua ali, e o portal tem de dizer isso em vez de sortear. Foi o caso que fez a regra existir.
//
// ⚠ ABREVIATURA É A REGRA, NÃO A EXCEÇÃO. A LPC escreve "G.C.", "G.C EL. +21800", "GC" — nunca
// "guarda-corpo" por extenso. Sem o dicionário abaixo, 158 das 186 peças da fila da OP-067 ficariam
// sem cor, que é justamente a obra de duas cores.

/** O que a fábrica escreve → a palavra que aparece no tipo de estrutura do PLP. */
const APELIDOS = [
  [/\bG\.?\s?C\.?\b/, "GUARDACORPO"],
  [/GUARDA\s*-?\s*CORPO/, "GUARDACORPO"],
  [/\bG\.?\s?CORPO\b/, "GUARDACORPO"],
  [/\bPLATAF/, "PLATAFORMA"],
  [/\bCOB(ERTURA)?\b/, "COBERTURA"],
  [/\bTER[ÇC]A\b/, "COBERTURA"],
  [/\bTESOURA\b/, "COBERTURA"],
];

const norm = (s) =>
  String(s || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Palavras de conteúdo de um texto, já com os apelidos aplicados. */
function palavras(texto) {
  let t = norm(texto);
  for (const [rx, canon] of APELIDOS) t = t.replace(rx, ` ${canon} `);
  return new Set(
    t.split(/[^A-Z0-9]+/)
      .filter((w) => w.length >= 4)
      // ⚠⚠ O PLURAL SEPARAVA O QUE É A MESMA COISA. O PLP escreve "PLATAFORMAS E ESCADAS" e a peça
      // diz "ESCADA" — sem cortar o S final, "ESCADA" não casava com NENHUM dos dois tipos e saía
      // como "não casou", quando na verdade ela é AMBÍGUA (aparece nos dois). O erro escondia
      // justamente o caso que a regra existe para pegar.
      .map((w) => (w.length > 4 && w.endsWith("S") ? w.slice(0, -1) : w))
      // ⚠ conectivos e palavras vazias de significado: "E", "DE", "DO" já caem no length,
      // mas "ESTRUTURA" e "METALICA" casariam com tudo e não distinguem nada.
      .filter((w) => !["ESTRUTURA", "METALICA", "METALICO", "PECA", "ITEM", "ITEN"].includes(w)),
  );
}

/**
 * A cor de uma peça, pelo tipo de estrutura do PLP.
 *
 * @param {string} descricao descrição da peça, como veio da LPC
 * @param {Array<{item?: string, cor?: string, obs?: string}>} itens `PlanoPintura.itens`
 * @returns {{cor: string|null, estrutura: string|null, origem: string}}
 *   `origem`: "único sistema" · "tipo da estrutura" · "sem itens no PLP" · "não casou" · "ambígua"
 */
export function corDaPeca(descricao, itens) {
  const lista = (Array.isArray(itens) ? itens : []).filter((i) => i && i.cor);
  if (!lista.length) return { cor: null, estrutura: null, origem: "sem itens no PLP" };

  // ⚠ UM TIPO SÓ = SEM AMBIGUIDADE POSSÍVEL. É o caso comum (OP-112: "Estruturas de cobertura"),
  // e aqui a descrição da peça não importa — a obra inteira é daquela cor.
  if (lista.length === 1) {
    return { cor: lista[0].cor, estrutura: lista[0].item || null, origem: "único sistema" };
  }

  const daPeca = palavras(descricao);
  if (!daPeca.size) return { cor: null, estrutura: null, origem: "não casou" };

  const casaram = lista
    .map((i) => {
      const doTipo = palavras(i.item);
      let n = 0;
      for (const w of doTipo) if (daPeca.has(w)) n++;
      return { item: i, n };
    })
    .filter((x) => x.n > 0);

  if (!casaram.length) return { cor: null, estrutura: null, origem: "não casou" };

  // ⚠ EMPATE É AMBIGUIDADE, NÃO DESEMPATE. Dois tipos com o mesmo número de palavras em comum
  // significa que a descrição não distingue os dois — e escolher um seria inventar.
  const max = Math.max(...casaram.map((x) => x.n));
  const topo = casaram.filter((x) => x.n === max);
  if (topo.length > 1) return { cor: null, estrutura: null, origem: "ambígua" };

  return { cor: topo[0].item.cor, estrutura: topo[0].item.item || null, origem: "tipo da estrutura" };
}

/**
 * Resumo das cores de um conjunto de peças — o que a folha mostra por cor, em vez de por peça.
 *
 * @param {Array<{descricao?: string, m2?: number|null, kg?: number}>} pecas
 * @param {Array} itens `PlanoPintura.itens`
 */
export function coresDasPecas(pecas, itens) {
  const porCor = new Map();
  for (const p of pecas) {
    const r = corDaPeca(p.descricao, itens);
    const k = r.cor || `⚠ definir (${r.origem})`;
    const a = porCor.get(k) || { cor: r.cor, estrutura: r.estrutura, origem: r.origem, pecas: 0, m2: 0, kg: 0, semArea: 0 };
    a.pecas += 1; a.kg += p.kg || 0;
    if (p.m2 == null) a.semArea += 1; else a.m2 += p.m2;
    porCor.set(k, a);
  }
  return [...porCor.entries()]
    .map(([rotulo, v]) => ({ rotulo, ...v, m2: Math.round(v.m2 * 100) / 100 }))
    .sort((a, b) => b.m2 - a.m2 || b.pecas - a.pecas);
}
