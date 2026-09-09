// Os APONTAMENTOS de uma RNC — puro JS, sem banco, usado no cliente, na rota e no PDF.
//
// ⚠⚠ UMA RNC PODE TER MAIS DE UM APONTAMENTO, E ELES NÃO PRECISAM CONCORDAR. Vitor (09/09/2026):
// "temos o caso da RNC 12 que temos 3 apontamentos onde 2 é procedente e um não é e não conseguimos
// fazer isso de uma forma separada nas rncs hoje".
//
// A RNC-012/26 (RTNC-014, DANPOWER, T74) é o caso: furação do pé dos guarda-corpos, piso da
// elevação 2414 e interferência nos degraus da 5136 estavam os três espremidos num parágrafo do
// campo `descricao`, com UM `pertinente`, UMA `disposicao` e UMA justificativa cobrindo o conjunto.
// As causas dela registravam o impasse em texto: "aguardando informação da Engenharia Torg junto ao
// cliente para análise da procedência TOTAL OU PARCIAL da reclamação". Parcial não cabia no modelo.
//
// ⚠ "DISPOSIÇÃO" É O TERMO, e ele substituiu "justificativa da procedência/improcedência" na tela e
// no PDF — decisão do Vitor no mesmo dia. A disposição é o bloco inteiro: a DECISÃO sobre o produto
// (o antigo seletor, que passou a se chamar assim para não haver dois "Disposição" na tela), o peso,
// o setor que gerou e o TEXTO que vai ao cliente. O texto existe nos dois estados: no procedente
// conta o que foi feito com a peça, no improcedente defende por que o apontamento não procede.

/** @typedef {{ id:string, descricao:string|null, referencia:string|null, procedente:boolean,
 *   decisao:string|null, disposicao:string|null, pesoKg:number|null, setor:string|null }} Apontamento */

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const txt = (v) => { const s = String(v ?? "").trim(); return s || null; };
const r2 = (n) => Math.round(n * 100) / 100;

/** Normaliza um item vindo do banco/tela para a forma canônica. */
export function normalizarApontamento(a, i = 0) {
  const procedente = a?.procedente !== false;
  return {
    id: txt(a?.id) || `ap${i + 1}`,
    descricao: txt(a?.descricao),
    referencia: txt(a?.referencia),
    procedente,
    // ⚠ improcedente não tem decisão sobre o produto, nem peso, nem setor: não há o que dispor de
    //   uma peça que está conforme. Zerar aqui — e não só esconder na tela — impede que um item
    //   marcado procedente por engano, preenchido e depois corrigido, siga somando no indicador.
    decisao: procedente ? txt(a?.decisao) : null,
    disposicao: txt(a?.disposicao),
    pesoKg: procedente ? num(a?.pesoKg) : null,
    setor: procedente ? txt(a?.setor) : null,
  };
}

/**
 * A lista de apontamentos de uma RNC.
 *
 * ⚠⚠ RNC ANTIGA NÃO FOI MIGRADA NO BANCO, É LIDA COMO UM ITEM SÓ. As 16 RNCs que existiam quando
 * isto entrou têm um apontamento por definição — foi assim que foram preenchidas. Derivar na
 * leitura, em vez de escrever um backfill, deixa o campo antigo intacto: se a regra aqui estiver
 * errada, corrige-se a função e nada precisa ser desfeito no banco.
 */
export function apontamentosDaRnc(rnc) {
  const lista = Array.isArray(rnc?.apontamentos) ? rnc.apontamentos : [];
  if (lista.length) return lista.map(normalizarApontamento);
  if (!rnc) return [];
  return [normalizarApontamento({
    id: "ap1",
    descricao: rnc.descricao,
    referencia: rnc.desenhoProjetoMarca,
    // ⚠ fora da RNC de cliente `pertinente` não quer dizer procedência (é o carimbo do indicador),
    //   então a RNC interna nasce procedente — ela é a não conformidade, não uma reclamação a julgar.
    procedente: rnc.tipo === "CLIENTE" ? rnc.pertinente !== false : true,
    decisao: rnc.disposicao,
    disposicao: rnc.respostaCliente,
    pesoKg: rnc.pesoRetrabalhoKg,
    setor: rnc.setorRetrabalho,
  })];
}

/** PROCEDENTE | IMPROCEDENTE | PARCIAL — o que o carimbo do PDF mostra. */
export function procedenciaDaRnc(aps) {
  const lista = aps || [];
  if (!lista.length) return "PROCEDENTE";
  const sim = lista.filter((a) => a.procedente).length;
  if (sim === 0) return "IMPROCEDENTE";
  if (sim === lista.length) return "PROCEDENTE";
  return "PARCIAL";
}

export const rotuloProcedencia = (p, n = {}) =>
  p === "PARCIAL" ? `PARCIALMENTE PROCEDENTE (${n.sim} de ${n.total})`
    : p === "IMPROCEDENTE" ? "IMPROCEDENTE" : "PROCEDENTE";

export const contagemProcedencia = (aps) => ({
  sim: (aps || []).filter((a) => a.procedente).length,
  total: (aps || []).length,
});

/** Só o apontamento PROCEDENTE com decisão de retrabalho pesa no indicador. */
const pesaNoRetrabalho = (a) => a.procedente && a.decisao === "RETRABALHAR" && (a.pesoKg || 0) > 0;

/** Soma dos pesos de retrabalho — é o que substitui o `pesoRetrabalhoKg` digitado à mão. */
export const pesoRetrabalhoTotal = (aps) =>
  r2((aps || []).filter(pesaNoRetrabalho).reduce((t, a) => t + (a.pesoKg || 0), 0));

/**
 * O peso de cada apontamento vai para o SETOR QUE O GEROU, não para um setor da RNC.
 * Vitor (09/09/2026): "deve ser somando cada tipo de apontamento". Numa RNC como a 12 os três
 * apontamentos podem ter donos diferentes — somar tudo num setor só mentiria sobre dois deles.
 * @returns {{ setor: string|null, kg: number }[]}
 */
export function pesoRetrabalhoPorSetor(aps) {
  const acc = new Map();
  for (const a of (aps || []).filter(pesaNoRetrabalho)) {
    const k = a.setor || "";
    acc.set(k, (acc.get(k) || 0) + (a.pesoKg || 0));
  }
  return [...acc.entries()]
    .map(([setor, kg]) => ({ setor: setor || null, kg: r2(kg) }))
    .sort((a, b) => b.kg - a.kg);
}

/**
 * Os apontamentos que ainda não podem encerrar a RNC.
 *
 * ⚠ A DISPOSIÇÃO É EXIGIDA PARA ENCERRAR, NÃO PARA SALVAR. Travar na gravação impediria salvar no
 * meio do preenchimento — que é como a tela é usada, com o inspetor voltando ao caso depois de
 * ouvir a Engenharia. O que não pode é a RNC ir para o arquivo sem dizer o que se decidiu.
 */
export function faltaDisposicao(aps) {
  return (aps || []).filter((a) => !a.disposicao).map((a, i) => a.id || `ap${i + 1}`);
}

/**
 * Os campos de RNC que passam a ser derivados dos apontamentos.
 *
 * ⚠⚠ OS CAMPOS ANTIGOS CONTINUAM SENDO ESCRITOS, de propósito. `pertinente` alimenta o indicador
 * ISO, `disposicao` é o filtro do indicador de retrabalho, `setorRetrabalho` e `pesoRetrabalhoKg`
 * saem no PDF e no FORM 34. Deixá-los parados enquanto a verdade migra para os apontamentos faria
 * cada tela responder uma coisa. Aqui eles viram o RESUMO da lista, calculado num lugar só.
 *
 * ⚠ `pertinente` é "algum apontamento procede", e não "todos" — Vitor (09/09/2026): "pode
 * considerar apenas abertura da RNC nesse caso, não precisa ser somado". A RNC-012 conta 1 no
 * índice de RNCs de cliente com 2 de 3 procedentes, igual contaria com 3 de 3: a meta do ano
 * (≤ 8) foi definida sobre RNCs abertas, e contar apontamentos mudaria a régua no meio do ano.
 */
export function resumoDosApontamentos(aps) {
  const lista = aps || [];
  const proc = lista.filter((a) => a.procedente);
  const kg = pesoRetrabalhoTotal(lista);
  const porSetor = pesoRetrabalhoPorSetor(lista);
  return {
    pertinente: proc.length > 0,
    // a decisão da RNC é a do apontamento que pesa mais; empate ou nenhum, a do primeiro procedente
    disposicao: proc.find((a) => a.decisao === "RETRABALHAR")?.decisao || proc.find((a) => a.decisao)?.decisao || null,
    pesoRetrabalhoKg: kg > 0 ? kg : null,
    setorRetrabalho: porSetor[0]?.setor || null,
    procedencia: procedenciaDaRnc(lista),
  };
}
