// Categorias de item de OP. Cada categoria tem um "tipo" default, mas o
// usuário pode mudar se precisar (Outro fica sempre como GENERICO).

export const CATEGORIAS_MATERIAL = [
  { codigo: "MATERIA_PRIMA",        label: "Matéria Prima",        tipo: "ESTRUTURA", unidade: "KG" },
  { codigo: "TINTA",                label: "Tinta",                tipo: "ESTRUTURA", unidade: "KG" },
  { codigo: "PARAFUSOS",            label: "Parafusos",            tipo: "ESTRUTURA", unidade: "KG" },
  { codigo: "TELHAS",               label: "Telhas",               tipo: "AREA",      unidade: "M²" },
  { codigo: "CALHAS_RUFOS",         label: "Calhas e Rufos",       tipo: "VERBA",     unidade: null },
  { codigo: "STEEL_DECK",           label: "Steel Deck",           tipo: "AREA",      unidade: "M²" },
  { codigo: "PLACA_WALL",           label: "Placa Wall",           tipo: "AREA",      unidade: "M²" },
  { codigo: "GALVANIZACAO",         label: "Galvanização",         tipo: "ESTRUTURA", unidade: "KG" },
];

// Servicos contratados de terceiros — engenharia, dobra, calandragem, etc.
// Codigos sao prefixados com SERV_ pra agrupar visualmente (igual ALUGUEL_).
export const CATEGORIAS_SERVICOS_TERCEIRIZADOS = [
  { codigo: "SERV_CALCULO_ESTRUTURAL",   label: "Cálculo Estrutural",   tipo: "VERBA", unidade: null },
  { codigo: "SERV_PROJETO_TERCEIRIZADO", label: "Projeto Terceirizado", tipo: "VERBA", unidade: null },
  { codigo: "SERV_DOBRA",                label: "Dobra",                tipo: "VERBA", unidade: null },
  { codigo: "SERV_CALANDRAGEM",          label: "Calandragem",          tipo: "VERBA", unidade: null },
  { codigo: "SERV_FRETES_ENTREGA",       label: "Fretes de Entrega",    tipo: "VERBA", unidade: null },
];

export const LOCAIS_ESTOQUE = [
  { codigo: "FABRICA",  label: "Fábrica" },
  { codigo: "TERCEIRO", label: "Terceiro" },
];

export const CATEGORIAS_ALUGUEL = [
  { codigo: "ALUGUEL_PLATAFORMA",        label: "Plataforma",                  tipo: "ALUGUEL" },
  { codigo: "ALUGUEL_MUNCK",             label: "Munck",                       tipo: "ALUGUEL" },
  { codigo: "ALUGUEL_GUINDASTE",         label: "Guindaste",                   tipo: "ALUGUEL" },
  { codigo: "ALUGUEL_GERADOR",           label: "Gerador",                     tipo: "ALUGUEL" },
  { codigo: "ALUGUEL_MACARICO",          label: "Maçarico",                    tipo: "ALUGUEL" },
  { codigo: "ALUGUEL_PERFURATRIZ",       label: "Perfuratriz",                 tipo: "ALUGUEL" },
  { codigo: "ALUGUEL_CONTAINER",         label: "Container",                   tipo: "ALUGUEL" },
  { codigo: "ALUGUEL_BANHEIRO",          label: "Banheiro de Obra",            tipo: "ALUGUEL" },
  { codigo: "ALUGUEL_SOLDA_STUDBOLT",    label: "Máquina de Solda Stud Bolt",  tipo: "ALUGUEL" },
];

export const CATEGORIA_OUTRO = { codigo: "OUTRO", label: "Outro (descrever)", tipo: "GENERICO", unidade: "UN" };

export const TODAS_CATEGORIAS = [
  ...CATEGORIAS_MATERIAL,
  ...CATEGORIAS_SERVICOS_TERCEIRIZADOS,
  ...CATEGORIAS_ALUGUEL,
  CATEGORIA_OUTRO,
];

export const TIPOS_ITEM = ["VERBA", "ESTRUTURA", "AREA", "ALUGUEL", "GENERICO"];

export function getCategoria(codigo) {
  return TODAS_CATEGORIAS.find((c) => c.codigo === codigo) || CATEGORIA_OUTRO;
}

export function isAluguel(categoria) {
  return categoria?.startsWith("ALUGUEL_");
}

export function isServicoTerceirizado(categoria) {
  return categoria?.startsWith("SERV_");
}

export function labelCategoria(codigo) {
  const c = getCategoria(codigo);
  if (isAluguel(codigo)) return `Aluguel — ${c.label}`;
  if (isServicoTerceirizado(codigo)) return `Serviço — ${c.label}`;
  return c.label;
}

// Categorias unicas presentes nos itens da OP (base + aditivos)
export function categoriasUnicasOP(op) {
  const set = new Set();
  for (const it of op?.itens || []) set.add(it.categoria);
  for (const ad of op?.aditivos || []) {
    for (const it of ad.itens || []) set.add(it.categoria);
  }
  return Array.from(set);
}

// Retorna agrupamento {materiais, servicos, alugueis, outros}
export function agruparPorGrupo(itens) {
  const materiais = [];
  const servicos = [];
  const alugueis = [];
  const outros = [];
  for (const it of itens || []) {
    if (isAluguel(it.categoria)) alugueis.push(it);
    else if (isServicoTerceirizado(it.categoria)) servicos.push(it);
    else if (it.categoria === "OUTRO") outros.push(it);
    else materiais.push(it);
  }
  return { materiais, servicos, alugueis, outros };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// PLANILHA COMERCIAL DO ESTUDO → ITENS CONTRATADOS DA OP.
//
// Vitor (19/08/2026): "você lê a planilha, coloca lá, mas me fala que não posso salvar a OP por
// não ter adicionado um item — você precisa preencher os campos de itens contratados também… o
// ideal é trazer exatamente as mesmas linhas da planilha comercial".
//
// As linhas da PLANILHA COMERCIAL já são os itens do contrato — mesma descrição, mesma unidade,
// mesma quantidade e mesmo valor. Digitar de novo é retrabalho e fonte de divergência entre o que
// foi vendido e o que a OP diz que foi vendido.

// ⚠ ORDEM IMPORTA: as regras ESPECÍFICAS vêm primeiro. "Cálculo estrutural, memorial e ART"
// contém "estrutural" e caía em MATÉRIA PRIMA quando a regra genérica vinha antes.
const RX_CATEGORIA = [
  [/c[áa]lculo\s+estrutural|memorial\s+e\s+art|\bart\b/i, "SERV_CALCULO_ESTRUTURAL"],
  // "MATÉRIA PRIMA" é o nome do próprio grupo na aba INDUSTRIALIZAÇÃO e caía em OUTRO
  [/mat[ée]ria[-\s]?prima/i, "MATERIA_PRIMA"],
  [/fixador/i, "PARAFUSOS"],
  [/qualidade|ensaio|ultrassom|liquido\s+penetrante/i, "OUTRO"],
  [/projeto\s+terceiriz|detalhamento\s+terceiriz/i, "SERV_PROJETO_TERCEIRIZADO"],
  [/frete|transporte/i, "SERV_FRETES_ENTREGA"],
  [/telha|steel\s*deck/i, "TELHAS"],
  [/calha|rufo|cumeeira|pingadeira/i, "CALHAS_RUFOS"],
  [/tinta|pintura|primer/i, "TINTA"],
  [/parafus|fixador|chumbador/i, "PARAFUSOS"],
  [/galvaniza/i, "GALVANIZACAO"],
  [/\bdobra\b/i, "SERV_DOBRA"],
  [/calandra/i, "SERV_CALANDRAGEM"],
  [/estrutura|perfil|chapa/i, "MATERIA_PRIMA"],
];

/** Categoria da OP a partir da descrição do item comercial. Sem casar, cai em OUTRO. */
export function categoriaDoItemComercial(descricao) {
  const d = String(descricao || "");
  for (const [rx, cod] of RX_CATEGORIA) if (rx.test(d)) return cod;
  return "OUTRO";
}

/**
 * Converte o estudo nos ITENS CONTRATADOS da OP.
 *
 * 🚨 O `valorVerba` do item é a VERBA DE COMPRA, não o preço de venda. Em
 * `/compras/painel-ops` ele é comparado com o total já em pedidos — se entrar o preço de venda,
 * o Compras acha que pode gastar o dobro. Vitor (19/08): "nas verbas estimadas pelo comercial
 * você puxa o valor integral da fabricação como matéria prima, porém na planilha temos isso bem
 * detalhado".
 *
 * Então a verba de cada linha = **custo de material + mão de obra terceirizada** daquela linha
 * (as colunas de custo da PLANILHA COMERCIAL). Fica de fora o que não é compra: a
 * industrialização (fabricação nossa) e o BDI.
 *
 * ⚠ A linha da ESTRUTURA é EXPLODIDA no detalhe da aba INDUSTRIALIZAÇÃO — matéria-prima,
 * fixadores e tintas — porque o custo de material dela (R$ 152.924 na OP-112) é exatamente a soma
 * desses três. Sem isso, tudo virava "matéria prima".
 */
export function itensDaPlanilhaComercial(comercial, custos = null) {
  const itensComerciais = Array.isArray(comercial) ? comercial : comercial?.itens;
  if (!itensComerciais?.length) return [];

  // detalhe do material da estrutura: 1.1 MATÉRIA PRIMA, 1.2 FIXADORES, 1.3 TINTAS
  const detalheMaterial = (custos?.grupos || []).filter((g) => /^1\.\d+$/.test(String(g.item || "")) && g.subtotal > 0);

  const monta = (descricao, unidade, qtd, verba, obs, tipoForcado = null) => {
    const codigo = categoriaDoItemComercial(descricao);
    const cat = getCategoria(codigo);
    return {
      categoria: codigo,
      tipo: tipoForcado || cat.tipo,
      descricao: String(descricao).slice(0, 200),
      localEstoque: "FABRICA",
      unidade: (unidade || cat.unidade || "").toUpperCase() || null,
      // ⚠ arredonda na ORIGEM: a planilha devolve 652.8800000000001 e isso ia parar no banco
      qtdContratada: Math.round((Number(qtd) || 0) * 100) / 100,
      cmcMedio: 0, meses: 0, valorPorMes: 0, capacidade: "",
      valorVerba: Math.round((Number(verba) || 0) * 100) / 100,
      faturamentoDireto: false,
      observacao: obs || null,
    };
  };

  const out = [];
  for (const i of itensComerciais) {
    const material = Number(i.custoMaterial) || 0;
    const mdo = Number(i.mdoTerceirizada) || 0;
    const ehEstrutura = /estrutura/i.test(i.descricao || "") && !/c[áa]lculo/i.test(i.descricao || "");

    if (ehEstrutura && detalheMaterial.length && material > 0) {
      for (const g of detalheMaterial) {
        out.push(monta(g.descricao, "KG", i.quantidade, g.subtotal,
          `Planilha comercial item ${i.item} · Industrialização ${g.item} ${g.descricao}${g.precoKg ? ` · custo R$ ${g.precoKg.toFixed(2)}/kg` : ""}`));
      }
    } else if (material > 0) {
      out.push(monta(i.descricao, i.unidade, i.quantidade, material, `Planilha comercial item ${i.item} · verba = custo de material`));
    }

    // Mão de obra terceirizada da linha (cálculo estrutural, qualidade, frete…) é compra de
    // serviço. ⚠ Na linha da estrutura o nome tem de vir do DETALHE da aba INDUSTRIALIZAÇÃO —
    // herdar "Fornecimento das estruturas" fazia o serviço ser classificado como matéria-prima.
    if (mdo > 0) {
      const daInd = (custos?.grupos || []).find((g) => /^2\.\d+$/.test(String(g.item || "")) && Math.abs((g.subtotal || 0) - mdo) < 1);
      const desc = ehEstrutura ? (daInd?.descricao || "Serviços terceirizados da estrutura") : i.descricao;
      out.push(monta(desc, i.verba ? null : i.unidade, i.verba ? 0 : i.quantidade, mdo,
        `Planilha comercial item ${i.item} · verba = mão de obra terceirizada`, "VERBA"));
    }
  }
  return out;
}

/**
 * META DE COMPRA POR FAMÍLIA — quanto o Compras pode gastar em cada coisa.
 *
 * Vitor (19/08/2026): "você não menciona os valores estimados para cada família, apenas os valores
 * finais — quanto posso gastar de tinta, parafuso, telha, rufo e por aí vai… os valores de receita
 * que formam nossa OP toda são com impostos já inclusos; como podemos trazer essa informação e
 * esse ser o número meta de compras para o setor de compras".
 *
 * A meta é o valor **BRUTO** de cada família: é ele que sai no pedido e é contra ele que o painel
 * de Compras compara o que já foi pedido. ICMS e PIS/COFINS aparecem como CRÉDITO ao lado — são
 * recuperáveis, então o custo real da obra é o líquido, mas o limite de gasto é o bruto.
 *
 * ⚠ NÃO usar o valor de venda como meta: ele carrega industrialização e BDI, que não são compra.
 */
export function metasDeCompra(comercial, custos = null) {
  const itens = itensDaPlanilhaComercial(comercial, custos);
  if (!itens.length) return [];

  // crédito por grupo da aba INDUSTRIALIZAÇÃO, casado pelo valor (é a única chave comum)
  const creditoPorValor = new Map();
  for (const g of custos?.grupos || []) {
    if (!(g.subtotal > 0)) continue;
    const cred = (Number(g.icms) || 0) + (Number(g.pisCofins) || 0);
    if (cred > 0) creditoPorValor.set(Math.round(g.subtotal * 100), cred);
  }

  const porFamilia = new Map();
  for (const it of itens) {
    const cat = getCategoria(it.categoria);
    const chave = it.categoria;
    const g = porFamilia.get(chave) || { categoria: chave, label: cat.label, meta: 0, credito: 0, itens: [] };
    g.meta += it.valorVerba;
    g.credito += creditoPorValor.get(Math.round(it.valorVerba * 100)) || 0;
    g.itens.push({ descricao: it.descricao, unidade: it.unidade, quantidade: it.qtdContratada, valor: it.valorVerba });
    porFamilia.set(chave, g);
  }

  return [...porFamilia.values()]
    .map((g) => ({
      ...g,
      meta: Math.round(g.meta * 100) / 100,
      credito: Math.round(g.credito * 100) / 100,
      liquido: Math.round((g.meta - g.credito) * 100) / 100,
    }))
    .sort((a, b) => b.meta - a.meta);
}

// Famílias que uma obra de estrutura metálica normalmente TEM. Se o estudo não previu verba pra
// uma delas, isso é informação — não esquecimento silencioso.
const FAMILIAS_ESPERADAS = [
  "MATERIA_PRIMA", "PARAFUSOS", "TINTA", "GALVANIZACAO",
  "TELHAS", "CALHAS_RUFOS", "SERV_CALCULO_ESTRUTURAL", "SERV_FRETES_ENTREGA",
];

/**
 * ESCOPO DE COMPRA a partir do estudo — pro Kick Off, pra Engenharia e Compras conferirem.
 *
 * Vitor (19/08/2026): "temos obras que não vão ter compra de parafusos e isso pode ser um ponto de
 * alerta, pois acaba passando. Então, se estiver destacado na planilha de estudo essas verbas você
 * precisa colocar como escopo; se não tiver, deixar como excluso".
 *
 * É a diferença entre "não compramos parafuso nesta obra porque o cliente fornece" e "ninguém
 * lembrou do parafuso". O Kick Off passa a dizer qual dos dois é.
 *
 * @returns {{incluso: string[], excluso: string[]}} frases prontas pro Kick Off
 */
export function escopoDeCompraDoEstudo(estudoDados) {
  const metas = metasDeCompra(estudoDados?.comercial, estudoDados?.custos);
  if (!metas.length) return { incluso: [], excluso: [] };

  const money = (n) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const comVerba = new Set(metas.map((m) => m.categoria));

  const incluso = metas.map((m) => {
    const qtd = m.itens.length === 1 && m.itens[0].quantidade
      ? ` (${Number(m.itens[0].quantidade).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${m.itens[0].unidade || ""})`.trimEnd()
      : "";
    return `${m.label}${qtd} — verba de compra ${money(m.meta)}`;
  });

  const excluso = FAMILIAS_ESPERADAS
    .filter((c) => !comVerba.has(c))
    .map((c) => `${getCategoria(c).label} — sem verba no estudo: confirmar se é fornecimento do cliente`);

  return { incluso, excluso };
}

/**
 * RECEITAS DO CONTRATO — o que vai ser FATURADO (≠ o que vai ser comprado).
 *
 * Vitor (19/08/2026): "a verba para compras ainda está como o total da obra, o que não pode ser.
 * A receita do contrato seria o valor a ser faturado, e itens de contrato seria o valor que o
 * Compras deveria comprar — isso que deve ser a confusão que está fazendo".
 *
 * Exatamente isso. A planilha comercial tem as duas colunas lado a lado e elas não se misturam:
 *
 *   VENDA  (`valor`)          → receita: 564.100,32 na OP-116. É o que sai na nota.
 *   COMPRA (`custoMaterial` + → verba:   327.633,00. É o teto do Compras.
 *           `mdoTerceirizada`)
 *
 * A diferença (industrialização + BDI) é o que a Torg transforma — não se compra. Usar a venda
 * como verba dava ao Compras 1,7× o que a obra pode gastar.
 *
 * Os impostos vêm da TABELA DE % DE IMPOSTOS da aba BDI, pelo CFOP da operação — os que incidem
 * na nota (ICMS, PIS, COFINS, ISS). CSLL e IRPJ são sobre lucro, não sobre a nota: entram no
 * resumo tributário do estudo, não na alíquota da linha.
 *
 * ⚠ Os campos `*Pct` do OPReceita são percentuais INTEIROS (18 = 18%) — a tela divide por 100.
 */
export function receitasDaPlanilhaComercial(comercial, bdi = null) {
  const itens = Array.isArray(comercial) ? comercial : comercial?.itens;
  if (!itens?.length) return [];

  const cfop = bdi?.cfopPadrao || 5101;
  const al = bdi?.aliquotas?.[cfop] || null;
  const pct = (v) => (v == null ? null : Math.round(v * 10000) / 100); // 0.18 → 18

  return itens
    .filter((i) => Number(i.valor) > 0)
    .map((i, n) => {
      const qtd = Number(i.quantidade) || 0;
      const porUnidade = qtd > 0 && !i.verba;
      return {
        ordem: n,
        categoria: categoriaDoItemComercial(i.descricao),
        descricao: String(i.descricao || "").slice(0, 200),
        cfop: String(cfop),
        tipoPreco: porUnidade ? "POR_UNIDADE" : "VALOR",
        unidade: porUnidade ? String(i.unidade || "").toUpperCase() || null : null,
        quantidade: porUnidade ? Math.round(qtd * 100) / 100 : null,
        valorUnitario: porUnidade ? Math.round((Number(i.unitario) || 0) * 100) / 100 : null,
        valor: Math.round((Number(i.valor) || 0) * 100) / 100,
        icmsPct: pct(al?.icmsPct),
        pisPct: pct(al?.pisPct),
        cofinsPct: pct(al?.cofinsPct),
        issPct: pct(al?.issPct),
        observacao: `Planilha comercial item ${i.item} · valor de venda`,
      };
    });
}

/**
 * RESUMO TRIBUTÁRIO DO ESTUDO — os impostos destacados que o Vitor sentiu falta na tela.
 *
 * Vitor (19/08/2026): "também não estou vendo os valores de impostos destacados".
 *
 * São três números diferentes e confundi-los é fácil:
 *   · `naNota`     — o que é destacado nas notas de venda (soma da coluna Impostos da BDI);
 *   · `credito`    — ICMS e PIS/COFINS recuperáveis nas COMPRAS (a planilha calcula por grupo);
 *   · `liquido`    — o que a obra realmente paga de imposto: naNota − credito.
 */
export function resumoTributario(bdi) {
  if (!bdi) return null;
  const naNota = (bdi.faturamento || []).reduce((s, f) => s + (Number(f.impostos) || 0), 0) || null;
  return {
    cfop: bdi.cfopPadrao,
    aliquotas: bdi.aliquotas?.[bdi.cfopPadrao] || null,
    venda: bdi.venda,
    naNota,
    credito: bdi.credito,
    liquido: bdi.totalImpostos,
    liquidoPct: bdi.totalImpostosPct,
    bdi: bdi.bdi,
    bdiPct: bdi.bdiPct,
    margem: bdi.margem,
    faturamentoTorg: bdi.faturamentoTorg,
    faturamentoDireto: bdi.faturamentoDireto,
    linhas: bdi.faturamento || [],
  };
}
