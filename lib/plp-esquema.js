// ─── O ESQUEMA DE PINTURA POR ESTRUTURA ─────────────────────────────────────────────────────────
//
// ⚠⚠ Vitor (15/10/2026): "no caso da tinta amarela ela recebe o primer e depois o acabamento amarelo, assim como a
// azul — no PLP isso não está claro e muito menos na folha do pintor". O PLP guarda as demãos numa lista e as cores
// por item em outra, e NADA ligava uma à outra. O da OP-094 tem Primer (1), Acabamento azul (3) e Acabamento
// amarelo (3): a folha listava as três em sequência, como se toda peça levasse as duas cores, e a conta dizia 3
// demãos onde cada peça leva 2.
//
// A REGRA (sem refazer os PLPs gravados): demãos com o MESMO número são ALTERNATIVAS, e quem escolhe entre elas é a
// COR do item. Demão sem alternativa (o primer) vale para todos. Puro: usado pela folha do pintor, pelo PDF do PLP,
// pelo editor e pela conta de tinta.

const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
export const mesmaCor = (a, b) => !!norm(a) && norm(a) === norm(b);

const demaosDo = (plano) => (Array.isArray(plano?.demaos) ? plano.demaos : []).filter((d) => d && (d.produto || d.cor || d.nome));
const itensDo = (plano) => (Array.isArray(plano?.itens) ? plano.itens : []).filter((i) => i && i.item);

/** As demãos agrupadas pelo número, na ordem: [[primer], [acab. azul, acab. amarelo]]. */
export function gruposPorOrdem(plano) {
  const porOrdem = new Map();
  demaosDo(plano).forEach((d, i) => {
    const k = d.ordem ?? `#${i}`;
    if (!porOrdem.has(k)) porOrdem.set(k, []);
    porOrdem.get(k).push(d);
  });
  return [...porOrdem.entries()]
    .sort(([a], [b]) => (Number(a) || 0) - (Number(b) || 0))
    .map(([ordem, demaos]) => ({ ordem, demaos }));
}

/** Quantas demãos cada peça leva — os números distintos, não o tamanho da lista. */
export const numeroDeDemaos = (plano) => gruposPorOrdem(plano).length;

// a demão de um grupo que vale para uma cor (null quando não há como escolher)
function escolher(grupo, cor) {
  if (grupo.demaos.length === 1) return grupo.demaos[0];
  const casam = grupo.demaos.filter((d) => mesmaCor(d.cor, cor));
  return casam.length === 1 ? casam[0] : null;
}

/**
 * O que cada estrutura recebe, demão a demão. Sem itens no PLP, um esquema único ("todas as peças").
 * @returns {{item:string, cor:string|null, sistema:string|null, demaos:object[], faltam:number[]}[]}
 */
export function esquemaPorEstrutura(plano) {
  const grupos = gruposPorOrdem(plano);
  const itens = itensDo(plano);
  const alvos = itens.length ? itens : [{ item: "Todas as peças", cor: null, sistema: null }];
  return alvos.map((it) => {
    const demaos = [], faltam = [];
    for (const g of grupos) {
      const d = escolher(g, it.cor);
      if (d) demaos.push(d); else faltam.push(g.ordem);
    }
    return { item: it.item, cor: it.cor || null, sistema: it.sistema || null, demaos, faltam };
  });
}

/** O que impede ler o esquema — frase por problema, dizendo onde corrigir no PLP. */
export function problemasDoEsquema(plano) {
  const out = [];
  const itens = itensDo(plano);
  for (const g of gruposPorOrdem(plano)) {
    if (g.demaos.length < 2) continue;
    if (g.demaos.some((d) => !norm(d.cor))) out.push(`Demão ${g.ordem}: há ${g.demaos.length} alternativas e alguma está sem cor — informe a cor de cada uma.`);
    const cores = g.demaos.map((d) => norm(d.cor)).filter(Boolean);
    if (new Set(cores).size < cores.length) out.push(`Demão ${g.ordem}: duas alternativas com a mesma cor — não dá para saber qual vai em cada estrutura.`);
    if (!itens.length) out.push(`Demão ${g.ordem}: há ${g.demaos.length} alternativas, mas o PLP não tem itens (estruturas com a cor de cada uma) para escolher.`);
  }
  for (const e of esquemaPorEstrutura(plano)) {
    if (!itens.length) continue;
    for (const o of e.faltam) {
      out.push(`${e.item}${e.cor ? ` (${e.cor})` : " (sem cor)"}: nenhuma demão ${o} nessa cor — inclua a demão ${o} na cor do item ou corrija a cor.`);
    }
  }
  return [...new Set(out)];
}

/**
 * As linhas do quadro "Esquema por estrutura" do PDF do PLP: [estrutura, cor, sequência]. Sem itens no PLP não há
 * o que mostrar — o quadro não aparece. Demão que não deu para escolher entra como "definir", à vista.
 */
export function linhasDoEsquemaPdf(plano) {
  if (!itensDo(plano).length || !demaosDo(plano).length) return [];
  return esquemaPorEstrutura(plano).map((e) => {
    const seq = e.demaos.map((d, i) => `${i + 1}ª ${d.nome || "Demão"}${d.produto ? ` — ${d.produto}` : ""}${d.cor ? ` (${d.cor})` : ""}`);
    for (const o of e.faltam) seq.push(`⚠ demão ${o}: definir no PLP`);
    return [e.item, e.cor || "—", seq.join("\n")];
  });
}
