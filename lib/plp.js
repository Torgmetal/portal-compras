import { numeroBR } from "@/lib/numero-br";
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
  const n = numeroBR(v, NaN);
  return Number.isFinite(n) ? n : null;
};
const txt = (v, max = 160) => (v === null || v === undefined ? null : String(v).trim().slice(0, max) || null);

/**
 * Uma demão do esquema: o que o PLP especifica, sem nada do que se mede.
 *
 * ⚠ OS QUATRO ÚLTIMOS SÃO A §2 DO DOCUMENTO ("Especificações das Tintas"): lote/R, diluição,
 * camada úmida e tempo de secagem. Eles existiam na folha e não existiam no cadastro — a folha
 * saía com as colunas em branco e ninguém tinha onde preencher. (Vitor, 27/08/2026: "me traga as
 * informações das folhas que precisamos preencher".)
 */
function normalizarDemao(d, i) {
  return {
    ordem: Number(d?.ordem) || i + 1,
    nome: txt(d?.nome, 60) || `${i + 1}ª demão`,
    produto: txt(d?.produto),
    fabricante: txt(d?.fabricante, 80),
    cor: txt(d?.cor, 60),
    espessuraMin: num(d?.espessuraMin),
    espessuraMax: num(d?.espessuraMax),
    lote: txt(d?.lote, 60),
    diluicao: txt(d?.diluicao, 80),
    camadaUmida: txt(d?.camadaUmida, 40),
    secagem: txt(d?.secagem, 80),
    // ⚠ o vínculo com o CATÁLOGO e a diluição ESCOLHIDA. A camada úmida sai da tabela do boletim
    // pela diluição usada (o mesmo produto dá 181 µm sem diluir e 209 µm a 15%) — sem guardar qual
    // foi, o número no plano vira um valor solto que ninguém consegue conferir.
    produtoId: txt(d?.produtoId, 40),
    diluicaoPct: num(d?.diluicaoPct),
    // ⚠ tinta epóxi e PU são BICOMPONENTES: sem os componentes e a proporção, o plano manda aplicar
    // metade do produto. Vitor (27/08/2026): "também trazer o componente A e B".
    componentes: txt(d?.componentes, 200),
    potLife: txt(d?.potLife, 60),
    // ⚠⚠ A ÚMIDA NÃO É UM NÚMERO SÓ. Vitor (27/08/2026): "você deve fazer o cálculo para 0%, 10% e
    // 15% de diluição" — é como a planilha dele apresenta, e é o que o pintor precisa: ele dilui
    // conforme o dia (temperatura, equipamento) e lê na folha a espessura úmida daquela condição.
    // [{ d: % de diluição, u: µm úmidos }]
    umidas: Array.isArray(d?.umidas)
      ? d.umidas.slice(0, 8).map((x) => ({ d: num(x?.d) ?? 0, u: num(x?.u) })).filter((x) => x.u)
      : [],
  };
}

/** Uma linha do índice de revisões da capa. */
function normalizarRevisao(r) {
  return {
    revisao: txt(r?.revisao, 20),
    data: txt(r?.data, 20),
    descricao: txt(r?.descricao, 300),
    elaborado: txt(r?.elaborado, 80),
    verificado: txt(r?.verificado, 80),
    aprovado: txt(r?.aprovado, 80),
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
    // ⚠ INTERNO/EXTERNO são colunas da folha 3 e mudam o esquema aplicado (a face interna de um
    // silo não leva o mesmo acabamento da externa).
    itens: Array.isArray(body?.itens)
      ? body.itens.slice(0, 60).map((i) => ({
          item: txt(i?.item, 120), sistema: txt(i?.sistema, 20),
          cor: txt(i?.cor, 60), obs: txt(i?.obs, 200),
          interno: !!i?.interno, externo: !!i?.externo,
        })).filter((i) => i.item)
      : [],
    documentosReferencia: txt(body?.documentosReferencia, 300),
    revisoes: Array.isArray(body?.revisoes)
      ? body.revisoes.slice(0, 30).map(normalizarRevisao).filter((r) => r.revisao || r.descricao)
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
  const produtos = [...new Set((plp?.demaos || []).map((d) => tipoDoProduto(d.produto)).filter(Boolean))];
  const cores = [...new Set([
    ...(plp?.itens || []).map((i) => i.cor),
    ...(plp?.demaos || []).map((d) => d.cor),
  ].filter(Boolean))];
  return { produtos, cores };
}

// ─── O TIPO DO PRODUTO, SEM A COR ─────────────────────────────────────────────
// Vitor (22/08/2026): "o produto/norma você está trazendo cores; o ideal seria apenas
// o tipo do produto".
//
// O nome no CMR e no PLP vem com a cor colada no fim — "INDUSTHANE RHB 650 DF SB PRETO
// N1", "INDUSTHANE RHB DF PRETO N1 AMARELO 5Y 8/12". No relatório isso é errado duas
// vezes: repete no campo Produto o que já está no campo Cor, e faz a mesma tinta
// aparecer como três produtos diferentes na lista, um por cor.
//
// A cor sempre vem DEPOIS do tipo, então cortar na primeira palavra de cor resolve —
// inclusive quando há duas cores no mesmo nome.
const CORES_RX = /\b(PRETO|BRANCO|CINZA|AMARELO|VERMELHO|AZUL|VERDE|LARANJA|MARROM|BEGE|ROSA|VIOLETA|ALUMINIO|ALUMÍNIO|GRAFITE|PRATA|DOURADO|GELO|CREME|RAL)\b/i;

export function tipoDoProduto(nome) {
  const n = String(nome || "").trim();
  if (!n) return n;
  const m = n.match(CORES_RX);
  // ⚠ só corta se sobrar nome: um produto que se CHAMA "PRETO FOSCO" não pode virar "".
  if (!m || m.index === 0) return n;
  const antes = n.slice(0, m.index).replace(/[\s·,\-]+$/, "").trim();
  return antes || n;
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
    if (d.produto) linha.produto = tipoDoProduto(d.produto);
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

/**
 * O sistema de pintura escrito por extenso, a partir do que o próprio plano diz.
 *
 * Vitor (27/08/2026): "nas observações você deve descrever o sistema que você mencionou acima, não
 * trazer essa escrita que está trazendo".
 *
 * ⚠⚠ MONTADO DOS CAMPOS, NÃO POR IA. A observação que estava lá veio da leitura automática do
 * documento e repetia o que já são campos — diluente, espessuras, documentos de referência, até o
 * nome do cliente e a cidade da obra. Texto que repete campo envelhece sozinho: muda a demão e a
 * observação continua dizendo a anterior. Aqui ela é derivada, então nasce certa e é editável.
 */
export function descreverSistema(plp, { grauNaNorma } = {}) {
  const p = plp || {};
  const n = (v) => (v === null || v === undefined || v === "" ? null : String(v));
  const partes = [];

  const grau = grauNaNorma ? grauNaNorma(p.grauLimpeza) : n(p.grauLimpeza);
  const prep = [
    n(p.preparoMetodo),
    grau && `ao grau ${grau} (ISO 8501-1)`,
    n(p.abrasivo) && `abrasivo ${p.abrasivo}`,
    (p.rugosidadeMin || p.rugosidadeMax) && `perfil de rugosidade ${n(p.rugosidadeMin) ?? "—"} a ${n(p.rugosidadeMax) ?? "—"} µm`,
  ].filter(Boolean);
  if (prep.length) partes.push(`Preparação de superfície: ${prep.join(", ")}.`);

  const demaos = (p.demaos || []).filter((d) => d.produto || d.cor || d.espessuraMin);
  if (demaos.length) {
    const texto = demaos.map((d, i) => {
      const esp = d.espessuraMin && d.espessuraMax && d.espessuraMax !== d.espessuraMin
        ? `${d.espessuraMin} a ${d.espessuraMax} µm secos`
        : d.espessuraMin ? `${d.espessuraMin} µm secos` : null;
      return [
        `${d.nome || `${i + 1}ª demão`}`,
        n(d.produto) && `— ${d.produto}`,
        n(d.fabricante) && `(${d.fabricante})`,
        n(d.cor) && `cor ${d.cor}`,
        esp,
      ].filter(Boolean).join(" ");
    }).join("; ");
    partes.push(`Esquema${n(p.metodoAplicacao) ? ` aplicado por ${String(p.metodoAplicacao).toLowerCase()}` : ""}: ${texto}.`);
  }
  if (p.espessuraTotal) partes.push(`Espessura total do sistema: ${p.espessuraTotal} µm secos.`);

  // a tabela de espessura úmida por diluição — o dado que o pintor usa na hora
  for (const d of demaos) {
    if (!(d.umidas || []).length) continue;
    const cond = d.umidas.map((x) => (Number(x.d) === 0 ? `${x.u} µm sem diluição` : `${x.u} µm a ${x.d}%`)).join(", ");
    partes.push(`${d.nome || "Demão"}${n(d.diluicao) ? ` — ${d.diluicao}` : ""}: camada úmida de ${cond}.`);
  }

  const comMistura = demaos.filter((d) => d.componentes || d.potLife);
  for (const d of comMistura) {
    partes.push(`${d.nome || "Demão"} — mistura: ${[n(d.componentes), n(d.potLife) && `vida útil da mistura ${d.potLife}`].filter(Boolean).join("; ")}.`);
  }

  const itens = (p.itens || []).filter((i) => i.item);
  if (itens.length) {
    const texto = itens.map((i) => {
      const face = [i.interno && "interno", i.externo && "externo"].filter(Boolean).join(" e ");
      return `${i.item}${face ? ` (${face})` : ""}${i.cor ? ` — ${i.cor}` : ""}`;
    }).join("; ");
    partes.push(`Aplicação por item: ${texto}.`);
  }

  return partes.join(" ");
}
