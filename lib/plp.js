// ─── PLP — PLANO DE PINTURA DA OBRA ───────────────────────────────────────────
// Vitor (22/08/2026): "aqui já não podemos deixar definido? puxando do PLP de cada
// obra"; e depois: "se buscarmos na CMR vamos conseguir o registro das tintas que
// foram especificadas para cada obra, e o PLP tem as aplicações recomendadas —
// poderia deixar isso mais dinâmico e rápido, para apenas preencher os valores
// encontrados".
//
// É a divisão certa do relatório de pintura, e ela tem três fontes:
//
//   PLP       o ESPECIFICADO  — preparo, grau, abrasivo, rugosidade, esquema de
//                               demãos, espessura mínima. Por obra.
//   CMR       o RECEBIDO      — a tinta que a obra realmente comprou: produto,
//                               fabricante, lote e validade, com o R que rastreia.
//   Inspetor  o MEDIDO        — leituras de rugosidade e espessura, condições do
//                               dia, horários, aderência, inspeção visual.
//
// ⚠ E o MEDIDO nunca nasce preenchido. Vitor já barrou isso uma vez, no dimensional:
// "esses números em vermelho não devem sair, o Inspetor é quem vai preencher essa
// informação". Pré-preencher medição é fabricar registro.

/** Métodos de preparação permitidos — PO-05 item 5.4. */
export const METODOS_PREPARO = [
  "Ferramentas manuais e/ou mecânicas",
  "Jateamento abrasivo",
  "Produtos químicos",
];

/**
 * O que o PO-05 usa quando o PLP da obra não diz outra coisa.
 *
 * O procedimento é explícito: "na fabricação de Estrutura Metálica utiliza em 90% das
 * obras o Grau SA2.1/2" (item 5.4) e "o jateamento deve desenvolver um perfil de
 * rugosidade entre 50 a 90 µm ou conforme o PLP" (item 5.5.1.1). São defaults do
 * PROCEDIMENTO, não invenção — e continuam editáveis por obra.
 */
export const PLP_PADRAO = {
  preparoMetodo: "Jateamento abrasivo",
  grauLimpeza: "SA2.5",
  rugosidadeMin: 50,
  rugosidadeMax: 90,
};

const num = (v) => {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const txt = (v, max = 160) => (v === null || v === undefined ? null : String(v).trim().slice(0, max) || null);

/** Uma demão do esquema: o que o PLP especifica, sem nada do que se mede. */
function normalizarDemao(d, i) {
  return {
    ordem: Number(d?.ordem) || i + 1,
    nome: txt(d?.nome, 60) || `${i + 1}ª demão`,
    produto: txt(d?.produto),
    fabricante: txt(d?.fabricante, 80),
    cor: txt(d?.cor, 60),
    espessuraMin: num(d?.espessuraMin),
    espessuraMax: num(d?.espessuraMax),
  };
}

export function normalizarPlp(body) {
  const demaos = Array.isArray(body?.demaos) ? body.demaos.slice(0, 6).map(normalizarDemao) : [];
  return {
    revisao: txt(body?.revisao, 30),
    preparoMetodo: txt(body?.preparoMetodo, 80),
    grauLimpeza: txt(body?.grauLimpeza, 20),
    abrasivo: txt(body?.abrasivo, 80),
    rugosidadeMin: num(body?.rugosidadeMin),
    rugosidadeMax: num(body?.rugosidadeMax),
    metodoAplicacao: txt(body?.metodoAplicacao, 60),
    demaos,
    // os itens da estrutura, com a cor de cada um — é daqui que sai a seleção de cor
    itens: Array.isArray(body?.itens)
      ? body.itens.slice(0, 60).map((i) => ({
          item: txt(i?.item, 120), sistema: txt(i?.sistema, 20),
          cor: txt(i?.cor, 60), obs: txt(i?.obs, 200),
        })).filter((i) => i.item)
      : [],
    espessuraTotal: num(body?.espessuraTotal),
    observacoes: txt(body?.observacoes, 2000),
  };
}

/**
 * O que o inspetor pode ESCOLHER na hora.
 *
 * Vitor (22/08/2026): "temos peças que são de cores diferentes... o Inspetor seleciona
 * na hora o que foi aplicado". Produto e cor deixam de ser texto livre — e deixam
 * também de ser um valor único imposto pelo esquema, que estaria errado em metade das
 * peças da mesma obra.
 */
export function opcoesDoPlp(plp) {
  const produtos = [...new Set((plp?.demaos || []).map((d) => d.produto).filter(Boolean))];
  const cores = [...new Set([
    ...(plp?.itens || []).map((i) => i.cor),
    ...(plp?.demaos || []).map((d) => d.cor),
  ].filter(Boolean))];
  return { produtos, cores };
}

/** A soma das espessuras mínimas das demãos — o mínimo do sistema, quando não informado. */
export function espessuraDoSistema(plp) {
  if (plp?.espessuraTotal) return plp.espessuraTotal;
  const d = Array.isArray(plp?.demaos) ? plp.demaos : [];
  const soma = d.reduce((t, x) => t + (Number(x?.espessuraMin) || 0), 0);
  return soma || null;
}

/**
 * O que o relatório de pintura já nasce sabendo.
 *
 * ⚠ SNAPSHOT, não consulta. O relatório é documento controlado: precisa registrar o
 * que estava especificado NO DIA da inspeção. Se o PLP for revisado depois, o
 * relatório antigo continua contando a história certa — o mesmo motivo pelo qual o
 * tipo da peça é gravado na criação e não lido na hora de gerar o PDF.
 */
export function camposDoRelatorioPintura(plp) {
  if (!plp) return {};
  // ⚠ PLP CALADO NÃO É AUSÊNCIA DE CRITÉRIO. O PO-05 item 5.5.1.1 diz que o jateamento
  // deve desenvolver perfil "entre 50 a 90 µm OU CONFORME O PLP" — quando o plano da obra
  // não declara faixa, é a do procedimento que vale. A origem vai escrita: o inspetor
  // precisa saber contra o que está medindo.
  const faixa = plp.rugosidadeMin && plp.rugosidadeMax
    ? `${plp.rugosidadeMin} a ${plp.rugosidadeMax} µm`
    : plp.rugosidadeMin ? `≥ ${plp.rugosidadeMin} µm`
    : `${PLP_PADRAO.rugosidadeMin} a ${PLP_PADRAO.rugosidadeMax} µm (PO-05)`;
  const total = espessuraDoSistema(plp);

  const demaos = {};
  for (const d of plp.demaos || []) {
    // só produto, fabricante e método: lote, validade, datas e medições são do inspetor
    const linha = {};
    if (d.produto) linha.produto = d.produto;
    if (d.fabricante) linha.fabricante = d.fabricante;
    if (plp.metodoAplicacao) linha.metodo = plp.metodoAplicacao;
    // ⚠ cor só quando a obra TEM UMA SÓ. Com duas ou mais, quem sabe qual foi aplicada é
    // quem estava na frente da peça — o campo fica para o inspetor escolher.
    if (d.cor && opcoesDoPlp(plp).cores.length === 1) linha.cor = d.cor;
    if (Object.keys(linha).length) demaos[d.ordem] = linha;
  }

  const out = {};
  if (plp.preparoMetodo) out.prepProcedimento = plp.preparoMetodo;
  if (plp.grauLimpeza) out.limpeza = plp.grauLimpeza;
  if (plp.abrasivo) out.abrasivo = plp.abrasivo;
  if (faixa) out.rugEspec = faixa;
  if (total) out.espessuraMinima = String(total);
  if (Object.keys(demaos).length) out.demaos = demaos;
  return out;
}

/** Rótulo curto para a tela: "PLP R2 · SA2½ · 3 demãos · 240 µm". */
export function resumoPlp(plp) {
  if (!plp) return "Sem PLP definido";
  const p = [];
  if (plp.revisao) p.push(`PLP ${plp.revisao}`);
  if (plp.grauLimpeza) p.push(plp.grauLimpeza.replace("SA2.5", "SA2½"));
  const n = (plp.demaos || []).length;
  if (n) p.push(`${n} ${n === 1 ? "demão" : "demãos"}`);
  const t = espessuraDoSistema(plp);
  if (t) p.push(`${t} µm`);
  return p.join(" · ") || "PLP em branco";
}
