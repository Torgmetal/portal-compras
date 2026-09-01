// ─── A LQC DENTRO DO PORTAL ───────────────────────────────────────────────────
// Vitor (22/08/2026): "a composição vejo que pode me ajudar muito... precisamos deixar isso
// alinhado, inclusive que você transforme cada aba da geração de custo igual está na nossa LQC, e
// quando eu pedir para extrair uma planilha você iria trazer exatamente o mesmo modelo preenchido".
//
// A LQC (`LQC-nnn-aa-CLIENTE-OBRA-TORG-Rxx.xlsx`) é a planilha de estudo do Comercial. Este
// módulo é a MESMA conta, em código: as listas, a tabela de preços e o encadeamento de abas.
//
// ⚠ POR QUE ESPELHAR EM VEZ DE INVENTAR. A planilha já é a regra de negócio da casa — quem
// orça confia nela, e a proposta sai dela. Uma composição "parecida" produziria número diferente
// do estudo e ninguém saberia qual dos dois está certo. Então: mesmas classes, mesmas faixas,
// mesmos preços, mesma ordem de contas. Divergiu, é bug daqui.
//
// ⚠ A PLANILHA SE CALCULA SOZINHA. Na LQC real, a aba INDUSTRIALIZAÇÃO é toda fórmula: puxa peso
// da RESUMOS_EM (tabela ESTIMATIVAS), preço da PARÂMETROS e tinta da MC_TINTAS. Por isso a
// exportação preenche as abas de ENTRADA e deixa o Excel refazer o resto — é o que garante que o
// arquivo entregue seja o modelo de verdade, com as fórmulas vivas, e não uma imitação.

// ── PARÂMETROS ────────────────────────────────────────────────────────────────
// Espelho da aba PARÂMETROS do modelo LQC-000-00. Preço em R$/kg.
export const CLASSES = [
  { key: "EXTRA_LEVE", nome: "Extra Leve", faixa: "0 a 10 kg/m", fabricacao: 5.5, demaos: [1.38, 2.06, 2.75], preMont10: 0.52, preMont100: 1.38 },
  { key: "LEVE", nome: "Leve", faixa: "10 a 25 kg/m", fabricacao: 3.67, demaos: [0.92, 1.38, 1.83], preMont10: 0.34, preMont100: 0.92 },
  { key: "MEDIO", nome: "Médio", faixa: "25 a 60 kg/m", fabricacao: 3.14, demaos: [0.79, 1.18, 1.57], preMont10: 0.29, preMont100: 0.79 },
  { key: "PESADO", nome: "Pesado", faixa: "60 a 120 kg/m", fabricacao: 2.75, demaos: [0.69, 1.03, 1.38], preMont10: 0.26, preMont100: 0.69 },
  { key: "EXTRA_PESADO", nome: "Extra Pesado", faixa: "> 120 kg/m", fabricacao: 2.44, demaos: [0.61, 0.92, 1.22], preMont10: 0.23, preMont100: 0.61 },
];
export const CLASSE_POR_NOME = Object.fromEntries(CLASSES.map((c) => [c.nome.toUpperCase(), c]));

// Categoria de perfil → preço da matéria-prima (R$/kg). A ordem é a da planilha.
// ⚠ `nome` É A CHAVE DA PLANILHA E NÃO SE MEXE; `rotulo` é o que a tela mostra.
// Vitor (23/08/2026): "melhore essas escritas — sei que trouxe da planilha dessa maneira, mas
// deixe melhor isso". A LQC escreve tudo em caixa alta e com abreviação, e o SUMIF/VLOOKUP dela
// casa por texto exato: mudar "Barra Quadrada" para "Barra quadrada" no `nome` faria a fórmula
// deixar de somar aquele material e o peso sumiria da conta, em silêncio. Então separa-se o que
// a planilha exige do que a pessoa lê.
export const PERFIS = [
  { nome: "U/Ue dobrado", rotulo: "U / Ue dobrado", preco: 7.0 },
  { nome: "Perfil soldado", rotulo: "Perfil soldado", preco: 10.5 },
  { nome: "U laminado", rotulo: "U laminado", preco: 8.0 },
  { nome: "Ferro chato", rotulo: "Ferro chato", preco: 6.5 },
  { nome: "Barra Quadrada", rotulo: "Barra quadrada", preco: 7.2 },
  { nome: "Barra Roscada", rotulo: "Barra roscada", preco: 18.0 },
  { nome: "Chapa Lisa", rotulo: "Chapa lisa", preco: 6.5 },
  { nome: "Chapa Expandida", rotulo: "Chapa expandida", preco: 10.5 },
  { nome: "Chapa Xadrez", rotulo: "Chapa xadrez", preco: 7.5 },
  { nome: "Ferro redondo", rotulo: "Ferro redondo", preco: 6.5 },
  { nome: "W laminado", rotulo: "W laminado", preco: 7.6 },
  { nome: "L laminado", rotulo: "L laminado", preco: 6.5 },
  { nome: "Tubo", rotulo: "Tubo", preco: 7.3 },
];

// ⚠ FATURAMENTO manda no IMPOSTO, não só no texto. Na planilha, ICMS e PIS/COFINS só entram na
// linha quando o faturamento é TORG (`=IF($D$5="TORG"; …)`): material que o cliente compra
// direto do fornecedor não passa pelo nosso faturamento e não carrega nosso imposto.
export const FATURAMENTO = ["TORG", "DIRETO", "N/A"];

// ⚠ ONDE A ESCOLHA DE FATURAMENTO EXISTE DE VERDADE. Vitor (23/08/2026): "na industrialização
// você traz alguns itens lá, como fabricação, se é Torg ou direto — não entendi nada; pré-montagem
// mesmo caso, pintura a mesma coisa, data book. Tudo isso não precisa estar lá, pois sempre será
// para a Torg".
//
// Ele está certo, e o motivo é simples: fabricação, pintura, pré-montagem e inspeção são serviço
// NOSSO — o cliente não tem como comprar isso direto de ninguém. Só faz sentido escolher onde o
// item pode mesmo vir de fora: material comprado e serviço de terceiro. Perguntar o resto era
// pedir uma decisão que não existe, e decisão que não existe confunde quem responde.
export const GRUPOS_COM_FATURAMENTO = ["materiaPrima", "fixadores", "tintas", "itensComerciais"];
export const SEMPRE_TORG = ["fabricacao", "pintura", "preMontagem", "qualidade"];
export const ESTRUTURAS = ["COBERTURA", "FECHAMENTO", "ESCADA", "ESCADA MARINHEIRO", "PLATAFORMA", "GUARDA CORPO", "SUPORTES", "ESTRUTURA AUXILIAR"];
export const ESTRUTURA_ROTULO = {
  COBERTURA: "Cobertura", FECHAMENTO: "Fechamento", ESCADA: "Escada",
  "ESCADA MARINHEIRO": "Escada marinheiro", PLATAFORMA: "Plataforma",
  "GUARDA CORPO": "Guarda-corpo", SUPORTES: "Suportes", "ESTRUTURA AUXILIAR": "Estrutura auxiliar",
};
export const METODO_ROTULO = { ESTIMATIVA: "Estimativa", "PESO DE PROJETO": "Peso de projeto" };
export const FATURAMENTO_ROTULO = { TORG: "Torg fatura", DIRETO: "Cliente compra direto", "N/A": "Não se aplica" };
export const METODOS = ["ESTIMATIVA", "PESO DE PROJETO"];
export const DEMAOS = ["01 DEMÃO", "02 DEMÃOS", "03 DEMÃOS", "N/A"];
export const PRE_MONTAGEM = ["PRÉ-MONT. 10%", "PRÉ-MONT. 100%", "N/A"];
export const ACOS = ["ASTM A572 Gr 50", "CIVIL 300", "ASTM A36", "SAE 1020", "ASTM A500 Gr B", "DIN 2440", "SCH 40", "ASTM A 570 Gr C", "SAC 350", "ZAR 400", "N/A"];
export const CAMADAS_TINTA = ["PRIMER", "INTERMEDIÁRIO", "ACABAMENTO"];

// Alíquotas da planilha. MATERIAL: ICMS 12% / PIS-COFINS 9,25%. SERVIÇO (MDO terceirizada):
// sem ICMS, PIS/COFINS 3,65%.
export const IMPOSTOS = { material: { icms: 0.12, pisCofins: 0.0925 }, servico: { icms: 0, pisCofins: 0.0365 } };

// ── A TABELA DE IMPOSTOS DA ABA BDI ───────────────────────────────────────────
// Vitor (23/08/2026): "não vi aba de impostos". Ela existe na LQC — é o quadro "TABELA DE % DE
// IMPOSTOS" da aba BDI —, só não tinha lugar no portal. Cada coluna é um CFOP / código de
// serviço, e o que a nota vai carregar depende de qual deles a linha de faturamento usa.
//
// ⚠ PIS E COFINS ENTRAM SOBRE A BASE SEM ICMS. A fórmula da planilha é
// `ICMS + PIS*(1-ICMS) + COFINS*(1-ICMS) + CSLL + IRPJ + ISS` — não a soma simples. Somar tudo
// direto infla a carga e o preço sai mais caro do que precisa; é erro que faz perder proposta.
export const CFOPS = [
  { cod: "5101", rotulo: "5101 — venda de produção, dentro do estado", icms: 0.18, iss: 0 },
  { cod: "6101", rotulo: "6101 — venda de produção, fora do estado", icms: 0.12, iss: 0 },
  { cod: "5125", rotulo: "5125 — industrialização para terceiro", icms: 0.018, iss: 0 },
  { cod: "701", rotulo: "701 — serviço (ISS 2%)", icms: 0, iss: 0.02 },
  { cod: "702", rotulo: "702 — serviço (ISS 5%)", icms: 0, iss: 0.05 },
  { cod: "1405", rotulo: "1405 — serviço (ISS 5%)", icms: 0, iss: 0.05 },
];
export const TRIBUTOS_FEDERAIS = { pis: 0.0165, cofins: 0.076, csll: 0.12 * 0.09, irpj: 0.12 * 0.25 };

// ─── CRÉDITO DE ICMS DAS COMPRAS ──────────────────────────────────────────────
// Vitor (23/08/2026): "um ponto importante para os impostos: teremos o crédito referente às
// compras, considerar 12% de ICMS nas compras — isso vai nos ajudar demais. Transporte,
// parafusos, tinta, material e acessórios comprados devem ser calculados e dado crédito".
//
// ⚠ ICMS É NÃO CUMULATIVO, E IGNORAR ISSO ENCARECE A PROPOSTA SEM MOTIVO. O imposto que a Torg
// paga é o DÉBITO da venda menos o CRÉDITO do que comprou. Numa obra em que o material é metade
// do custo, esquecer o crédito joga milhões de imposto que não existem dentro do preço — e o
// concorrente que conta certo ganha a concorrência com a mesma margem.
//
// ⚠ E SÓ CREDITA O QUE A TORG COMPRA. Material que o cliente compra direto do fornecedor nunca
// passou pela nossa entrada: não há nota nossa, não há crédito.
export const ALIQUOTA_CREDITO_ICMS = 12;

/** O que cada grupo de compra gera de crédito, à alíquota informada. */
export function creditoDeIcms(bases = {}, aliquotaPct = ALIQUOTA_CREDITO_ICMS) {
  const aliq = n(aliquotaPct) / 100;
  const linhas = [
    { key: "materiaPrima", nome: "Matéria-prima (aço)", base: r2(n(bases.materiaPrima)) },
    { key: "fixadores", nome: "Fixadores (parafusos, chumbadores)", base: r2(n(bases.fixadores)) },
    { key: "tintas", nome: "Tintas e diluentes", base: r2(n(bases.tintas)) },
    { key: "comerciais", nome: "Acessórios e itens comerciais", base: r2(n(bases.comerciais)) },
    { key: "frete", nome: "Transporte", base: r2(n(bases.frete)) },
  ].map((l) => ({ ...l, aliquotaPct: r2(aliq * 100), valor: r2(l.base * aliq) }));
  return { linhas, total: r2(linhas.reduce((a, l) => a + l.valor, 0)), aliquotaPct: r2(aliq * 100) };
}

/** Carga tributária total de um CFOP, na fórmula da planilha. */
export function cargaDoCfop(cod) {
  const c = CFOPS.find((x) => x.cod === String(cod));
  if (!c) return 0;
  const f = TRIBUTOS_FEDERAIS;
  return c.icms + f.pis * (1 - c.icms) + f.cofins * (1 - c.icms) + f.csll + f.irpj + c.iss;
}

// As linhas de faturamento do quadro "VALORES DE FATURAMENTO" (BDI!F24:F29) — é aqui que se diz
// com que CFOP cada parte da venda sai.
export const LINHAS_FATURAMENTO = [
  { key: "ITENS_COMERCIAIS", nome: "Itens comerciais", padrao: "6101" },
  { key: "MATERIAL_IND", nome: "Matéria-prima e insumos", padrao: "6101" },
  { key: "PROJETO", nome: "Projeto — 5% do faturamento Torg", padrao: "702" },
  { key: "INDUSTRIALIZACAO", nome: "Industrialização", padrao: "5125" },
  { key: "MONTAGEM", nome: "Montagem", padrao: "702" },
  { key: "EQUIPAMENTOS", nome: "Equipamentos", padrao: "6101" },
];

// Composição do BDI, na ordem da aba (BDI!B10:B16). Os três primeiros entram no numerador
// (custos indiretos sobre o custo); os quatro últimos, no denominador (incidem sobre a venda).
export const BDI_CAMPOS = [
  { key: "administracao", nome: "Administração do escritório central", onde: "custo" },
  { key: "seguro", nome: "Seguro", onde: "custo" },
  { key: "risco", nome: "Risco", onde: "custo" },
  { key: "impostos", nome: "Impostos", onde: "venda" },
  { key: "factoring", nome: "Despesas financeiras (factoring)", onde: "venda" },
  { key: "margem", nome: "Margem de lucro previsto", onde: "venda" },
  { key: "comissoes", nome: "Comissões", onde: "venda" },
];

// Itens comerciais (aba ITENS COMERCIAIS / QTDS ITENS COMERCIAIS), com a unidade da planilha.
// ─── DE ONDE VEM A ESPECIFICAÇÃO DE CADA ITEM COMERCIAL ───────────────────────────────────────
// Vitor (31/08/2026): "puxe as telhas que já compramos e, se for fazer isso, já traga os códigos do
// Omie; e caso não tenha o item com a especificação, informe a necessidade de cadastro no OMIE".
//
// ⚠ CATÁLOGO VIVO, NÃO LISTA CONGELADA. Escrever à mão "todas as variações de mercado" produziria
// uma lista que nasce desatualizada e que ninguém mantém — e pior, com itens que não existem no
// Omie e por isso não viram pedido. A especificação passa a sair do PRÓPRIO catálogo do Omie, que
// é o que o Compras consegue comprar. Onde o Omie não tem, a tela diz que falta cadastrar.
//
// Medido em 31/08/2026 nos 2.409 produtos sincronizados: telhas 5 · calhas 13 · rufos 4 ·
// lanternim 1 · chumbadores 41 · grades de piso 3 — e ZERO em venezianas, steel deck e linha de
// vida, que são exatamente os três que a proposta oferece e o Omie não sabe comprar.
export const TERMOS_OMIE = {
  TELHA_TERMO: ["telha", "termoac", "sandu", "pir", "eps"],
  TELHA_SIMPLES: ["telha"],
  CALHAS: ["calha"],
  RUFOS: ["rufo"],
  LANTERNIM: ["lanternim", "exaustor eolico"],
  VENEZIANAS: ["veneziana"],
  CHUMBADORES: ["chumbador"],
  STEEL_DECK: ["steel deck", "steeldeck"],
  LINHA_VIDA: ["linha de vida"],
  GRADE_PISO: ["grade de piso", "grade piso", "gradil"],
};

// ⚠ A ORDEM É POR FAMÍLIA (ver lib/cotacao-familias.js), e não alfabética nem histórica: a tela
// agrupa por família para o botão de cotar não misturar telha com parafuso, e o agrupamento só
// funciona com a lista já ordenada. Trocar a ordem aqui quebra a separação lá.
export const ITENS_COMERCIAIS = [
  { key: "TELHA_TERMO", nome: "TELHA TERMOACÚSTICA - 0,50 x 0,43 - PIR 30mm", rotulo: "Telha termoacústica 0,50 × 0,43 — PIR 30 mm", un: "m²", preco: 125 },
  { key: "TELHA_SIMPLES", nome: "TELHA SIMPLES TP 40 - 0,65mm", rotulo: "Telha simples TP 40 — 0,65 mm", un: "m²", preco: 0 },
  { key: "CALHAS", nome: "CALHAS", rotulo: "Calhas", un: "m", preco: 120 },
  { key: "RUFOS", nome: "RUFOS", rotulo: "Rufos", un: "m", preco: 40 },
  { key: "LANTERNIM", nome: "LANTERNIM", rotulo: "Lanternim", un: "m", preco: 0 },
  { key: "GRADE_PISO", nome: "GRADES DE PISO", rotulo: "Grades de piso", un: "m²", preco: 0 },
  { key: "CHUMBADORES", nome: "CHUMBADORES QUÍMICOS", rotulo: "Chumbadores químicos", un: "un", preco: 0 },
  { key: "VENEZIANAS", nome: "VENEZIANAS", rotulo: "Venezianas", un: "m²", preco: 0 },
  { key: "STEEL_DECK", nome: "STEEL DECK", rotulo: "Steel deck", un: "m²", preco: 0 },
  { key: "LINHA_VIDA", nome: "LINHA DE VIDA", rotulo: "Linha de vida", un: "m", preco: 0 },
];

// ── ÁREA DE PINTURA A PARTIR DO PESO ──────────────────────────────────────────
// Vitor (23/08/2026): "deixar o campo para preencher, caso tenhamos essa informação da área de
// pintura, ou veja se conseguimos fazer uma estimativa de área de acordo com o peso — acha
// prudente?".
//
// Prudente POR FAMÍLIA DE PERFIL, nunca com um número só para a obra inteira. Medido nas 13.390
// peças da LPC que já têm área e peso lançados (1.286 t), a superfície por quilo varia 2,6 vezes
// entre o perfil mais pesado e o mais leve:
//
//   HP laminado 21,5 m²/t · W laminado 32,0 · Chapa 30,1 · Barra 30,3 · Tubo 42,2
//   L laminado 46,4 · U / Ue 55,0            (média geral 33,0 m²/t)
//
// Num galpão de 100 t, escolher a média em vez do perfil certo erra de 2.150 a 5.500 m² — e é
// essa área que precifica tinta e ensaio por m². Daí a regra: área informada MANDA; coeficiente
// só entra como sugestão, e o usuário vê de onde ele veio.
//
// ⚠ os números acima são a NOSSA história, não tabela de norma. Reimportar obras muda a base —
// vale recalcular de tempos em tempos.
export const COEF_AREA = {
  "U/Ue dobrado": 0.055, "U laminado": 0.055, "L laminado": 0.0464, "Tubo": 0.0422,
  "W laminado": 0.032, "Perfil soldado": 0.032,
  "Chapa Lisa": 0.0301, "Chapa Xadrez": 0.0301, "Chapa Expandida": 0.0301, "Ferro chato": 0.0301,
  "Ferro redondo": 0.0303, "Barra Quadrada": 0.0303, "Barra Roscada": 0.0303,
};
export const COEF_AREA_MEDIO = 0.033;
export function coefSugerido(perfil) { return COEF_AREA[perfil] || COEF_AREA_MEDIO; }

// ── RENDIMENTO DE TINTA ───────────────────────────────────────────────────────
// Rendimento teórico (m²/L) = sólidos por volume (%) × 10 ÷ película seca (µm).
// O fator de perda desconta o que não fica na peça (overspray, borda, retoque): com 45% de
// perda, aproveita-se 55% do teórico.
export function rendimentoTinta({ solidos, peliculaSeca, perda = 0 } = {}) {
  const sol = n(solidos), esp = n(peliculaSeca);
  if (sol <= 0 || esp <= 0) return { teorico: 0, pratico: 0 };
  const teorico = (sol * 10) / esp;
  const pratico = teorico * Math.max(0.05, 1 - n(perda) / 100);
  return { teorico: r2(teorico), pratico: r2(pratico) };
}

// ⚠ DILUENTE É 25% DOS LITROS DE TINTA. Conferido na LQC-081-26-TMSA-VALE: primer 26.131,41 L →
// 6.532,85 L de diluente; acabamento 4.199,61 → 1.049,90. Exatamente um quarto, nas quatro
// camadas. Sem contar o diluente, o custo de tinta sai ~12% abaixo — e tinta é 8% da obra.
export const DILUENTE_PCT = 25;

/** Litros e custo de uma camada, dada a área que ela cobre. Inclui diluente. */
export function custoCamada(t, areaM2) {
  const { teorico, pratico } = rendimentoTinta(t);
  const area = n(areaM2);
  const litros = pratico > 0 ? area / pratico : 0;
  const tinta = litros * n(t?.precoLitro);
  const litrosDil = litros * (n(t?.diluentePct ?? DILUENTE_PCT) / 100);
  const diluente = litrosDil * n(t?.precoDiluente);
  return {
    teorico, pratico, litros: r2(litros), litrosDiluente: r2(litrosDil),
    tinta: r2(tinta), diluente: r2(diluente), total: r2(tinta + diluente),
  };
}

// ── ENSAIOS DA QUALIDADE ──────────────────────────────────────────────────────
// Vitor (23/08/2026): "precisamos criar uma aba para dar custos específicos a teste da qualidade…
// Pull-off, Salinidade, Ultrassom, Dimensional N1, Visual de Solda N1 (para esses testes verificar
// na norma a quantidade que precisamos fazer por kg ou por m²)".
//
// ⚠ A FREQUÊNCIA AQUI É PONTO DE PARTIDA, NÃO A NORMA. Cada ensaio tem sua referência, mas a
// quantidade que se faz numa obra sai do CONTRATO e do procedimento dela — a mesma norma admite
// planos de amostragem diferentes, e o cliente costuma apertar. Chutar isso custa dinheiro dos
// dois lados: a mais, perde-se a proposta; a menos, assume-se ensaio que não foi orçado. Então o
// número vem editável, com a referência escrita ao lado, para quem orça confirmar contra a
// especificação da obra.
export const ENSAIOS = [
  { key: "PULL_OFF", nome: "Aderência (pull-off)", norma: "ABNT NBR 15877 / ASTM D4541", base: "m2", cada: 200, custo: 0 },
  { key: "SALINIDADE", nome: "Sais solúveis (Bresle)", norma: "ISO 8502-6 / 8502-9", base: "m2", cada: 500, custo: 0 },
  { key: "ULTRASSOM", nome: "Ultrassom em solda", norma: "AWS D1.1 / PETROBRAS N-1738", base: "kg", cada: 5000, custo: 0 },
  { key: "DIMENSIONAL_N1", nome: "Dimensional N1", norma: "ABNT NBR 8800 / PO Torg", base: "kg", cada: 5000, custo: 0 },
  { key: "VISUAL_SOLDA_N1", nome: "Visual de solda N1", norma: "AWS D1.1", base: "kg", cada: 2000, custo: 0 },
];
export const BASES_ENSAIO = { kg: "por kg de estrutura", m2: "por m² de pintura" };

/**
 * Quantos ensaios e quanto custam.
 * @param {object} cfg  { [key]: { cada, custo, ativo, base } }
 */
export function calcularEnsaios(cfg = {}, pesoKg = 0, areaM2 = 0) {
  const linhas = ENSAIOS.map((e) => {
    const c = cfg[e.key] || {};
    const ativo = c.ativo !== false && (n(c.custo) > 0 || c.ativo === true);
    const base = c.base || e.base;
    const cada = n(c.cada ?? e.cada);
    const universo = base === "m2" ? n(areaM2) : n(pesoKg);
    // ⚠ arredonda PRA CIMA: meio ensaio não existe, e a obra que passa de 500 m² por 1 m² paga
    // o segundo ensaio do mesmo jeito.
    const qtd = ativo && cada > 0 ? Math.ceil(universo / cada) : 0;
    const custoUnit = n(c.custo ?? e.custo);
    return { ...e, base, cada, ativo, universo: r2(universo), qtd, custoUnit, total: r2(qtd * custoUnit) };
  });
  return { linhas, total: r2(linhas.reduce((a, l) => a + l.total, 0)) };
}

// ── PINTURA: O CUSTO ESCALONA COM AS DEMÃOS ───────────────────────────────────
// Vitor (23/08/2026): "na pintura precisamos definir quantas demãos vamos usar; dependendo a
// quantidade o preço varia por conta do tempo. Escalonar esse custo, consegue fazer uma média?".
//
// A média está na própria PARÂMETROS da LQC. Comparando as três colunas de demãos nas cinco
// classes: 2 demãos custa 1,49–1,51× a primeira e 3 demãos custa 1,99–2,01×. Ou seja, cada demão
// depois da primeira acrescenta metade do preço dela — o retrabalho é menor que o primeiro passe,
// porque preparação de superfície e montagem do posto só acontecem uma vez.
export const FATOR_DEMAO_EXTRA = 0.5;
export function precoPinturaPorDemaos(precoUmaDemao, demaos) {
  const nd = Math.max(1, Math.round(n(demaos) || 1));
  return r2(n(precoUmaDemao) * (1 + FATOR_DEMAO_EXTRA * (nd - 1)));
}

// ── PRÉ-MONTAGEM: PERCENTUAL LIVRE ────────────────────────────────────────────
// Vitor: "para a pré-montagem criar uma nova aba também para colocarmos o custo (deixar
// selecionável a % da quantidade que precisamos pré-montar) e com isso vamos formar o preço".
//
// ⚠ A LQC só tem duas âncoras — PRÉ-MONT. 10% e PRÉ-MONT. 100%. Entre elas, interpola reto: é a
// leitura mais honesta de dois pontos, e diz explicitamente que 55% não é um preço tabelado, e sim
// uma interpolação. Fora do intervalo, prende nas âncoras em vez de extrapolar para número que
// ninguém mediu.
export function precoPreMontagem(classe, pct) {
  const p = Math.max(0, Math.min(100, n(pct)));
  if (p <= 0) return 0;
  const a = n(classe?.preMont10), b = n(classe?.preMont100);
  if (p <= 10) return r2(a * (p / 10));
  if (p >= 100) return r2(b);
  return r2(a + ((p - 10) / 90) * (b - a));
}

// Mão de obra terceirizada (aba INDUSTRIALIZAÇÃO, item 2). Preço em R$/kg sobre o peso total.
// ── QUANTAS CARGAS CABEM ──────────────────────────────────────────────────────
// Vitor (23/08/2026): "para as estruturas extra leve calcular a média de 6,5 toneladas por carga,
// para a leve 8 ton, para a média 12 ton, para a pesada 14 ton, extra pesada 20 ton".
//
// ⚠ O QUE LIMITA A CARGA NÃO É SÓ O PESO — É O VOLUME. A carreta é a mesma nos cinco casos; o que
// muda é que estrutura leve OCUPA a prancha antes de atingir o limite de peso. Por isso um perfil
// extra leve fecha a carga com 6,5 t e um extra pesado só fecha com 20 t. Calcular frete pelo peso
// total dividido por uma capacidade única erra para os dois lados: sobra carreta na obra pesada e
// falta na obra leve.
//
// ⚠ São médias da casa, não regra: ficam editáveis por estudo. Vitor escreveu "pesada" duas vezes
// (14 e 16 t) — ficou 14, e é um campo, não uma constante enterrada.
export const CAPACIDADE_CARGA = {
  EXTRA_LEVE: 6500, LEVE: 8000, MEDIO: 12000, PESADO: 14000, EXTRA_PESADO: 20000,
};

/**
 * Peso e número de cargas por classe, no escopo selecionado.
 * @param {object} pesoPorClasse { "LEVE": kg, … } — chaveado pelo NOME da classe em caixa alta
 * @param {object} capacidades   sobrescreve CAPACIDADE_CARGA por chave da classe
 */
export function cargasPorClasse(pesoPorClasse = {}, capacidades = {}) {
  const linhas = CLASSES.map((c) => {
    const kg = n(pesoPorClasse[c.nome.toUpperCase()]);
    const cap = n(capacidades[c.key]) > 0 ? n(capacidades[c.key]) : CAPACIDADE_CARGA[c.key];
    // ⚠ carga se arredonda PRA CIMA: meia carreta não sai da fábrica, e o excedente de um quilo
    // custa a viagem inteira.
    const cargas = kg > 0 && cap > 0 ? Math.ceil(kg / cap) : 0;
    return {
      key: c.key, nome: c.nome, faixa: c.faixa,
      pesoKg: r2(kg), capacidadeKg: cap, cargas,
      // quanto a última carga vai realmente levar — mostra a carreta que sai pela metade
      ultimaCargaKg: cargas > 0 ? r2(kg - (cargas - 1) * cap) : 0,
    };
  });
  return {
    linhas: linhas.filter((l) => l.pesoKg > 0),
    totalCargas: linhas.reduce((a, l) => a + l.cargas, 0),
    pesoTotal: r2(linhas.reduce((a, l) => a + l.pesoKg, 0)),
  };
}

// ── FRETE ─────────────────────────────────────────────────────────────────────
// Vitor (23/08/2026): "frete precisa ter uma aba dedicada para ele, e um seletor para apresentar
// ele separado do preço por kg ou diluído no preço unitário, pois isso cada cliente pede essa
// informação".
//
// ⚠ A APRESENTAÇÃO NÃO MUDA O CUSTO — MUDA O QUE O CLIENTE VÊ, e isso vale dinheiro na
// negociação. Diluído, o R$/kg da estrutura fica mais alto e o frete não vira alvo de corte;
// separado, o cliente compara o nosso frete com o transportador dele — e às vezes leva o frete
// por conta. Quem decide é o cliente, e a proposta tem de sair dos dois jeitos sem refazer conta.
export const MODOS_FRETE = [
  { key: "kg", nome: "Por quilo transportado", ajuda: "R$/kg sobre o peso do escopo" },
  { key: "viagem", nome: "Por viagem", ajuda: "preço da carreta × número de viagens" },
  { key: "verba", nome: "Valor fechado", ajuda: "um preço só para todo o transporte" },
];
export const APRESENTACAO_FRETE = [
  { key: "diluido", nome: "Diluído no R$/kg", ajuda: "some ao preço da estrutura; não aparece na proposta" },
  { key: "separado", nome: "Item separado", ajuda: "linha própria na proposta, fora do R$/kg" },
];

/**
 * O frete do escopo.
 * @param {object} cfg { modo, precoKg, precoViagem, capacidadeKg, viagens, verba, faturamento,
 *                       apresentacao, origem, destino }
 */
/**
 * @param {number} fracaoEscopo peso do escopo ÷ peso do levantamento inteiro (1 = obra toda)
 *
 * ⚠ VALOR ABSOLUTO TAMBÉM ACOMPANHA O ESCOPO. Vitor (23/08/2026): "quando eu desmarcar uma área
 * do quantitativo é como se eu tivesse excluído ela do escopo, só não estou fazendo isso para
 * garantir o histórico do que foi feito desde o início".
 *
 * Então desmarcar é excluir, e frete de uma área que não existe não existe. Verba e número de
 * viagens digitados valem para o levantamento INTEIRO e encolhem na proporção do peso — frete é
 * fisicamente proporcional ao que embarca, ao contrário de uma taxa fixa de projeto. Quem cotou o
 * frete já para o escopo reduzido trava com `escopoFixo`.
 */
export function calcularFrete(cfg = {}, pesoKg = 0, cargas = null, fracaoEscopo = 1) {
  const modo = cfg.modo || "kg";
  const peso = n(pesoKg);
  const fracao = cfg.escopoFixo ? 1 : (n(fracaoEscopo) > 0 ? n(fracaoEscopo) : 1);
  // ⚠ o número de viagens vem das CARGAS POR CLASSE quando há quantitativo: estrutura leve fecha
  // a carreta com 6,5 t e pesada com 20 t, então dividir o peso total por uma capacidade única
  // erra para os dois lados. Sem quantitativo, cai numa capacidade média.
  const capacidade = n(cfg.capacidadeKg) || 27000;
  const viagens = modo === "viagem"
    ? (n(cfg.viagens) > 0 ? Math.ceil(n(cfg.viagens) * fracao)
      : cargas?.totalCargas > 0 ? cargas.totalCargas
      : Math.ceil(peso / Math.max(1, capacidade)))
    : 0;
  const total = modo === "kg" ? r2(peso * n(cfg.precoKg))
    : modo === "viagem" ? r2(viagens * n(cfg.precoViagem))
    : r2(n(cfg.verba) * fracao);
  return {
    modo, total, viagens, capacidadeKg: capacidade,
    porKg: peso > 0 ? Math.round((total / peso) * 10000) / 10000 : 0,
    apresentacao: cfg.apresentacao === "separado" ? "separado" : "diluido",
    // quanto do valor digitado sobrou depois do corte de escopo — a tela mostra a conta
    fracaoEscopo: Math.round(fracao * 10000) / 10000,
    escopoFixo: !!cfg.escopoFixo,
    valorCheio: modo === "verba" ? r2(n(cfg.verba)) : modo === "viagem" && n(cfg.viagens) > 0 ? r2(Math.ceil(n(cfg.viagens)) * n(cfg.precoViagem)) : null,
    faturamento: cfg.faturamento || "TORG",
    origem: cfg.origem || null, destino: cfg.destino || null,
    // ⚠ DE ONDE VEIO O NÚMERO. Vitor (23/08/2026): "no frete precisamos um campo para colocarmos o
    // valor orçado para ficar registrado, e informar o nome da transportadora ou se foi apenas na
    // tabela de fretes". Seis meses depois, olhando uma proposta perdida, a pergunta é sempre essa:
    // era cotação ou chute de tabela? Sem o registro o comercial defende um número sem dono. Sai
    // no resultado para chegar na planilha e no resumo, não só na aba.
    fonte: cfg.fonte === "COTACAO" ? "COTACAO" : "TABELA",
    transportadora: cfg.transportadora || null,
    dataOrcamento: cfg.dataOrcamento || null,
    orcado: n(cfg.orcado) > 0 ? r2(n(cfg.orcado)) : null,
    // diferença entre o que se cotou e o que a composição está usando
    difOrcado: n(cfg.orcado) > 0 ? r2(total - n(cfg.orcado)) : null,
  };
}

// ── TERCEIROS ─────────────────────────────────────────────────────────────────
// Vitor (23/08/2026): "se criar uma nova aba e colocar terceiros, para podermos fabricar alguns
// itens, e aí ter a opção de faturamento direto ou Torg, aí tudo bem".
//
// É o único lugar onde a pergunta "Torg ou direto?" tem resposta possível: serviço de fora pode
// ser contratado por nós e revendido, ou contratado pelo cliente direto do fornecedor. Estes
// quatro são atalho — a lista é livre, porque cada obra terceiriza uma coisa diferente.
//
// ⚠ `chave` amarra o item à linha certa da LQC (2.1 a 2.4). Item sem chave é livre e cai em
// "2.5 OUTROS", que tem duas linhas no modelo.
export const TERCEIROS_SUGESTOES = [
  { chave: "CALCULO", descricao: "Cálculo estrutural, memorial e ART", base: "kg" },
  { chave: "GALVANIZACAO", descricao: "Galvanização a fogo", base: "kg" },
  { chave: "GALV_FRETE", descricao: "Frete da galvanização", base: "kg", comIcms: true },
];
// ⚠ o transporte até a obra saiu daqui: virou aba própria, porque precisa de modo de cobrança
// (kg, viagem, verba) e de escolha de apresentação — coisas que a lista genérica não comporta.
export const BASES_TERCEIRO = { kg: "R$ por kg da obra", m2: "R$ por m² de pintura", verba: "valor fechado" };

// compatibilidade com o formato antigo (objeto por chave), para estudo já salvo não perder dado
export const TERCEIRIZADOS = TERCEIROS_SUGESTOES.map((t) => ({ key: t.chave, nome: t.descricao, comIcms: t.comIcms }));

// ── O QUE A PLANILHA DERIVA, O PORTAL NÃO PERGUNTA ────────────────────────────
// Vitor (23/08/2026), sobre três seletores no topo do quantitativo: "qual o sentido disso?".
// Nenhum, e a checagem contra a LQC mostra por quê:
//
//   Demãos de tinta   a planilha CONTA as camadas lançadas na MC_TINTAS
//                     (`C47 = "Nº DEMÃOS - " & COUNTIFS(Tabela27…, [Camada de Tinta], "<>N/A")`).
//                     Um seletor à parte criava uma segunda verdade — que nem chegava no arquivo.
//   % de perda        sai da ESTRUTURA: guarda-corpo e escada marinheiro dão 85%, o resto 45%
//                     (`O4 = IF(OR(Estrutura="guarda corpo"; …="escada marinheiro"); 85%; 45%)`).
//   Método            é POR LINHA na RESUMOS_EM (coluna E). Um global era duplicata do que já
//                     existe em cada elemento.
//
// Campo que o sistema pode deduzir e ainda assim pergunta é campo que vai divergir: alguém troca
// um e esquece o outro, e aí o estudo e a planilha discordam sem ninguém saber qual está certo.

/**
 * Quantas demãos: é a contagem de CAMADAS DISTINTAS, não de linhas.
 *
 * ⚠ CORRIGIDO CONTRA A LQC REAL (LQC-081-26-TMSA-VALE, 23/08/2026). Lá o grupo de 45% tem quatro
 * linhas — um PRIMER e três ACABAMENTO, uma por cor da obra (cinza, azul, amarelo) — e a
 * industrialização cobra **2 demãos**, não 4. Faz sentido: a cor não é uma demão a mais, é a mesma
 * demão em trechos diferentes. Contando linha, eu estava cobrando pintura de menos: 1 demão onde
 * eram 2, e o custo de pintura saía 33% abaixo do estudo de verdade.
 */
export function demaosDeTintas(tintas, perda = 45) {
  const camadas = new Set(
    (tintas || [])
      .filter((t) => Number(t?.perda ?? 45) === perda && t?.camada && String(t.camada).toUpperCase() !== "N/A")
      .map((t) => String(t.camada).trim().toUpperCase())
  );
  return camadas.size;
}

/** O fator de perda vem da estrutura — é a regra da própria planilha. */
/** Perda de uma LINHA: a lançada manda; sem ela, deduz da estrutura. */
export function perdaDaLinha(l) {
  const v = n(l?.perda);
  return v > 0 ? v : perdaDaEstrutura(l?.estrutura);
}

// PERDA DE TINTA POR TIPO DE ESTRUTURA — 85% em guarda-corpo e escada marinheiro, 45% no resto.
// (Vitor, 31/08/2026, confirmando a regra: "para estruturas tipo guarda corpo e escadas marinheiro
// usar 85% de perda, para estruturas convencionais usar 45%".)
//
// ⚠ O NOME VEM DIGITADO À MÃO, e por isso a comparação precisa perdoar a grafia: "GUARDA-CORPO"
// com hífen, "guarda corpo" sem, "CORRIMÃO" com acento. A versão anterior só pegava a forma exata
// com espaço — quem escrevesse com hífen levava 45% numa peça que gasta o dobro de tinta, e nada
// na tela dizia que a regra não tinha pegado.
export function perdaDaEstrutura(estrutura) {
  const e = String(estrutura || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")   // corrimão → corrimao
    .replace(/[^a-z0-9]+/g, " ");                        // guarda-corpo → guarda corpo
  return /guarda corpo|escada marinheiro|corrimao/.test(e) ? 85 : 45;
}

// ⚠ VÍRGULA É DECIMAL AQUI. Vitor (23/08/2026): "parafusos coloquei o custo, não aparece no
// resumo". O campo é texto e ele digitou "0,15" — `Number("0,15")` dá NaN, que virava 0, e o
// custo sumia sem erro nenhum na tela. Num orçamento isso é o pior tipo de falha: não avisa,
// só entrega um preço menor do que devia. Todo número do estudo passa por aqui.
export function numeroBr(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v ?? "").trim();
  if (!s) return 0;
  let limpo;
  if (s.includes(",")) {
    // tem vírgula: ela é o decimal, e o ponto é milhar — "1.234,56"
    limpo = s.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    // ⚠ só ponto, em grupos de 3: é milhar, não decimal. "8.500" na Torg é oito mil e quinhentos,
    // não oito e meio. Sem esta regra, um preço de verba viraria R$ 8,50 sem avisar ninguém.
    limpo = s.replace(/\./g, "");
  } else {
    limpo = s; // "0.15", "2.5" — ponto decimal, como vem de planilha
  }
  const x = Number(limpo.replace(/[^\d.eE+-]/g, ""));
  return Number.isFinite(x) ? x : 0;
}
const n = numeroBr;
const r2 = (v) => Math.round(n(v) * 100) / 100;

/**
 * A conta da LQC, na ordem da planilha.
 *
 * @param {object} c composição:
 *   { resumos:[{area,estrutura,elemento,metodo,classificacao,un,quantidade,unidades,pesoUnit,perfil,perdaTinta}],
 *     faturamento:{materiaPrima,fixadores,tintas,fabricacao,pintura,preMontagem,...},
 *     precos:{perfil:{},classe:{}}, demaos, preMontagem, fixadoresRsKg, tintas:[…],
 *     terceirizados:{key:{precoKg}}, itensComerciais:{key:{qtd,preco}}, bdi:{…} }
 */
export function calcularLqc(c = {}) {
  // ⚠ ÁREA DESMARCADA SAI DA CONTA, MAS NÃO DO ESTUDO. Vitor (23/08/2026): "pode ser que ele
  // exclua alguns pacotes do nosso escopo, até mesmo por conta do tempo… precisa deixar uma forma
  // de selecionar e desselecionar, pois pode ser que ele peça para deixar alguma outra área, e aí
  // evitaria de termos que refazer todo o levantamento da área novamente".
  //
  // O levantamento é a parte cara do estudo — medir, classificar, tirar o coeficiente. Apagar uma
  // área para simular um escopo menor jogaria fora esse trabalho, e negociação vai e volta: o
  // cliente corta a galeria, depois pede a treliça de volta. Então a linha continua guardada e só
  // deixa de contar. É o mesmo que a LQC real faz na aba de cenário ("4 áreas selecionadas").
  const todas = Array.isArray(c.resumos) ? c.resumos : [];
  const resumos = todas.filter((l) => l?.ativo !== false);
  const fat = c.faturamento || {};
  const precoPerfil = { ...Object.fromEntries(PERFIS.map((p) => [p.nome, p.preco])), ...(c.precos?.perfil || {}) };

  // ── peso por classe e por categoria de perfil (é o que a RESUMOS_EM alimenta) ──
  const pesoPorClasse = {}, pesoPorPerfil = {};
  let pesoTotal = 0, areaM2 = 0;
  for (const l of resumos) {
    const kg = n(l.pesoTotal ?? n(l.quantidade) * n(l.unidades || 1) * n(l.pesoUnit));
    pesoTotal += kg;
    // ⚠ área INFORMADA manda. Só na falta dela entra o coeficiente — o da linha, se lançado, ou
    // o sugerido pelo perfil. Estimativa nunca sobrepõe medição.
    areaM2 += n(l.areaM2) > 0
      ? n(l.areaM2)
      : (n(l.coef) > 0 ? n(l.coef) : coefSugerido(l.perfil)) * kg;
    const cl = String(l.classificacao || "").toUpperCase();
    if (cl && cl !== "N/A") pesoPorClasse[cl] = (pesoPorClasse[cl] || 0) + kg;
    if (l.perfil) pesoPorPerfil[l.perfil] = (pesoPorPerfil[l.perfil] || 0) + kg;
  }

  // ⚠ A FRAÇÃO DO ESCOPO é o que faz valor absoluto encolher junto. Vitor (23/08/2026): "quando eu
  // desmarcar uma área do quantitativo é como se eu tivesse excluído ela do escopo, só não estou
  // fazendo isso para garantir o histórico do que foi feito desde o início". Desmarcar É excluir:
  // o levantamento fica guardado, mas não entra em conta nenhuma.
  //
  // ⚠ declarada AQUI, antes de qualquer grupo usá-la — `const` não existe acima da própria linha,
  // e o build do Next não pega isso: só estoura na hora de calcular.
  const pesoLevantado = todas.reduce((a2, l) => a2 + n(l.pesoTotal ?? n(l.quantidade) * n(l.unidades || 1) * n(l.pesoUnit)), 0);
  const fracaoEscopo = pesoLevantado > 0 ? pesoTotal / pesoLevantado : 1;

  // Uma linha do quadro, com o imposto que a planilha aplica quando o faturamento é TORG.
  const linha = (nome, kg, precoKg, faturamento, tipo = "material", espec = null) => {
    const subtotal = r2(n(kg) * n(precoKg));
    const t = IMPOSTOS[tipo];
    const torg = String(faturamento || "").toUpperCase() === "TORG";
    return {
      nome, espec, pesoKg: r2(kg), precoKg: n(precoKg), subtotal, faturamentoEscolhido: faturamento || null,
      icmsPct: t.icms, pisCofinsPct: t.pisCofins,
      icms: torg ? r2(subtotal * t.icms) : 0,
      pisCofins: torg ? r2(subtotal * t.pisCofins) : 0,
    };
  };
  const somar = (linhas) => linhas.reduce((a, l) => ({
    pesoKg: r2(a.pesoKg + l.pesoKg), subtotal: r2(a.subtotal + l.subtotal),
    icms: r2(a.icms + l.icms), pisCofins: r2(a.pisCofins + l.pisCofins),
  }), { pesoKg: 0, subtotal: 0, icms: 0, pisCofins: 0 });

  // ── 1. MATERIAL PARA INDUSTRIALIZAÇÃO ──
  //
  // ⚠ MATÉRIA-PRIMA É POR ÁREA DA OBRA, NÃO POR CATEGORIA DE PERFIL. Descoberto lendo a
  // LQC-081-26-TMSA-VALE-TR36 que o Vitor mandou (23/08/2026), depois de ele dizer que estava
  // "difícil demais chegar onde esperava". Num estudo de verdade a coluna "Perfil Predominante"
  // fica VAZIA e o aço é cotado por área — APOIOS E ARTICULAÇÕES a R$ 7,62/kg, TRELIÇA a R$ 6,50,
  // GALERIA a R$ 7,55. Faz sentido: o comprador cota o pacote daquele trecho, não "quantos quilos
  // de chapa lisa tem na obra inteira".
  //
  // Eu tinha montado por categoria de perfil, que é como o modelo EM BRANCO sugere. Resultado: o
  // campo que decidia o custo do aço era justamente o que ninguém preenche, e a matéria-prima
  // saía zerada. Preço por perfil continua existindo como plano B, para quem orçar assim.
  const materiaPrima = resumos.some((l) => n(l.precoKg) > 0)
    ? resumos
        .filter((l) => n(l.precoKg) > 0 || n(l.pesoTotal ?? n(l.quantidade) * n(l.unidades || 1) * n(l.pesoUnit)) > 0)
        .map((l) => linha(
          l.area || l.item || "Área",
          n(l.pesoTotal ?? n(l.quantidade) * n(l.unidades || 1) * n(l.pesoUnit)),
          l.precoKg, fat.materiaPrima, "material", l.classificacao || null,
        ))
    : PERFIS.map((p) => linha(p.rotulo, pesoPorPerfil[p.nome] || 0, precoPerfil[p.nome], fat.materiaPrima));
  const fixadores = [linha("Parafusos A325 e A307", pesoTotal, c.fixadoresRsKg, fat.fixadores)];
  // ⚠ UMA LINHA POR FATOR DE PERDA, somando as camadas — é assim na LQC real. A MC_TINTAS lista
  // camada por camada (primer, e um acabamento por COR da obra), mas a industrialização carrega
  // dois números: o custo da estrutura em geral (45%) e o de guarda-corpo e escada marinheiro
  // (85%). Tratar cada camada como uma linha inflava o custo, porque cada uma reivindicava o peso
  // inteiro da obra.
  const pesoPorPerda = {};
  for (const l of resumos) {
    const kg = n(l.pesoTotal ?? n(l.quantidade) * n(l.unidades || 1) * n(l.pesoUnit));
    const pd = perdaDaLinha(l);
    pesoPorPerda[pd] = (pesoPorPerda[pd] || 0) + kg;
  }
  const areaPorPerda = {};
  for (const l of resumos) {
    const kg = n(l.pesoTotal ?? n(l.quantidade) * n(l.unidades || 1) * n(l.pesoUnit));
    const a = n(l.areaM2) > 0 ? n(l.areaM2) : (n(l.coef) > 0 ? n(l.coef) : coefSugerido(l.perfil)) * kg;
    const pd = perdaDaLinha(l);
    areaPorPerda[pd] = (areaPorPerda[pd] || 0) + a;
  }

  // ⚠ A ÁREA DE CADA CAMADA É DERIVADA DO ESCOPO, NUNCA GUARDADA. Vitor (23/08/2026): "você está
  // desconsiderando o cálculo da tinta para as áreas que não serão parte do escopo?". Estava: as
  // camadas importadas trazem a área do escopo CHEIO (75.853 m² no primer de 45%), e o custo do
  // grupo usava esse número fixo. Resultado: desmarcar a casa de transferência tirava 20 mil m²
  // da tabela por área e não tirava um centavo do preço — o pior tipo de erro, porque a tela
  // mostrava a coisa certa e a proposta saía errada.
  //
  // A regra é a mesma que a tabela por área usa, e foi conferida no estudo real: primer e
  // intermediário cobrem todas as áreas do grupo de perda; acabamento só as da SUA COR.
  const norm2 = (x) => String(x || "").trim().toUpperCase();
  const areaPorCor = {};
  for (const l of resumos) {
    const kg = n(l.pesoTotal ?? n(l.quantidade) * n(l.unidades || 1) * n(l.pesoUnit));
    const a = n(l.areaM2) > 0 ? n(l.areaM2) : (n(l.coef) > 0 ? n(l.coef) : coefSugerido(l.perfil)) * kg;
    const k = `${perdaDaLinha(l)}|${norm2(l.cor)}`;
    areaPorCor[k] = (areaPorCor[k] || 0) + a;
  }
  const areaDaCamada = (t, perda) => {
    // digitada na tela vence — é como se força uma área que o levantamento não pegou
    if (n(t.areaM2) > 0) return n(t.areaM2);
    if (norm2(t.camada) === "ACABAMENTO") return areaPorCor[`${perda}|${norm2(t.cor)}`] || 0;
    return areaPorPerda[perda] || 0;
  };

  const camadasDe = (perda) => (c.tintas || []).filter((t) => Number(t?.perda ?? 45) === perda);
  const tintas = [45, 85].map((perda) => {
    const camadas = camadasDe(perda).map((t) => {
      const areaCamada = areaDaCamada(t, perda);
      return { ...t, ...custoCamada({ ...t, perda }, areaCamada), areaM2: r2(areaCamada) };
    });
    const pesoGrupo = pesoPorPerda[perda] || 0;
    const custoGrupo = camadas.reduce((a, x) => a + x.total, 0);
    // preço digitado vence o calculado — é o que permite colar um número fechado do fornecedor
    const digitado = camadasDe(perda).find((t) => n(t.precoKg) > 0);
    const precoKg = digitado ? n(digitado.precoKg) : (pesoGrupo > 0 ? Math.round((custoGrupo / pesoGrupo) * 1e6) / 1e6 : 0);
    const l = linha(
      perda === 45 ? "Estrutura em geral" : "Guarda-corpo e escada marinheiro",
      pesoGrupo, precoKg, fat.tintas, "material", `perda ${perda}%`,
    );
    // ⚠ tinta leva ICMS 18% na LQC real, não os 12% do aço
    l.icmsPct = 0.18;
    l.icms = String(fat.tintas || "").toUpperCase() === "TORG" ? r2(l.subtotal * 0.18) : 0;
    return { ...l, perda, camadas, litros: r2(camadas.reduce((a, x) => a + x.litros, 0)), areaM2: r2(areaPorPerda[perda] || 0) };
  }).filter((l) => l.pesoKg > 0 || l.subtotal > 0);

  // ── 2. TERCEIROS ──
  // lista livre; o formato antigo (objeto por chave) continua sendo lido para não perder estudo salvo
  const listaTerceiros = Array.isArray(c.terceiros) && c.terceiros.length
    ? c.terceiros
    : TERCEIROS_SUGESTOES
        .map((t) => ({ ...t, precoUnit: c.terceirizados?.[t.chave]?.precoKg, faturamento: fat[t.chave] || fat.terceirizados }))
        .filter((t) => n(t.precoUnit) > 0);

  // peso e área de cada área da obra, para o terceiro que se cobra só de um trecho
  const pesoPorArea = {}, areaPorArea = {};
  for (const l of resumos) {
    const kg = n(l.pesoTotal ?? n(l.quantidade) * n(l.unidades || 1) * n(l.pesoUnit));
    const a2 = n(l.areaM2) > 0 ? n(l.areaM2) : (n(l.coef) > 0 ? n(l.coef) : coefSugerido(l.perfil)) * kg;
    if (l.area) {
      pesoPorArea[l.area] = (pesoPorArea[l.area] || 0) + kg;
      areaPorArea[l.area] = (areaPorArea[l.area] || 0) + a2;
    }
  }

  const terceirizados = listaTerceiros.map((t) => {
    const base = t.base || "kg";
    // ⚠ terceiro pode valer só para UMA área (na LQC real, cálculo estrutural é assim: um preço
    // por trecho, com descrição própria). Sem área, vale a obra inteira.
    const pesoBase = t.area ? (pesoPorArea[t.area] || 0) : pesoTotal;
    // ⚠ VERBA NÃO ENCOLHE SOZINHA. Valor fechado amarrado a uma área que saiu do escopo tem de
    // ZERAR — o serviço não será feito. Já a verba da obra inteira continua cheia, e isso pode
    // estar certo (contrato fechado) ou errado (escopo caiu pela metade): a tela avisa em vez de
    // decidir sozinha.
    const areaFora = !!t.area && !pesoPorArea[t.area];
    // ⚠ verba também acompanha o escopo, pela mesma razão do frete: desmarcar é excluir. Serviço
    // realmente fechado em contrato trava com `escopoFixo` e a tela mostra que ele não encolheu.
    const fracaoT = t.escopoFixo || t.area ? 1 : fracaoEscopo;
    const qtd = areaFora ? 0
      : base === "kg" ? pesoBase
      : base === "m2" ? (t.area ? (areaPorArea[t.area] || 0) : areaM2)
      : (n(t.quantidade) || 1) * fracaoT;
    const sug = TERCEIROS_SUGESTOES.find((x) => x.chave === t.chave);
    const l = linha(t.descricao || sug?.descricao || "Terceiro", qtd, t.precoUnit, t.faturamento, "servico", t.area || BASES_TERCEIRO[base]);
    l.chave = t.chave || null;
    l.area = t.area || null;
    l.foraDoEscopo = areaFora;
    l.escopoFixo = !!t.escopoFixo;
    l.fracaoEscopo = Math.round(fracaoT * 10000) / 10000;
    l.naoAcompanha = base === "verba" && !!t.escopoFixo && resumos.length < todas.length;
    l.base = base;
    // frete carrega ICMS 12% como na planilha, mesmo sendo serviço
    if (sug?.comIcms || t.comIcms) {
      l.icmsPct = 0.12;
      l.icms = String(t.faturamento || "").toUpperCase() === "TORG" ? r2(l.subtotal * 0.12) : 0;
    }
    return l;
  });

  // ── 3. INDUSTRIALIZAÇÃO (fabricação, pintura, pré-montagem) ──
  // ⚠ demãos = quantas camadas foram lançadas na MC_TINTAS. Ver demaosDeTintas acima.
  const nDemaos = Math.max(1, demaosDeTintas(c.tintas));
  const iDemaos = Math.max(0, Math.min(2, nDemaos - 1));
  // ⚠ até 3 demãos vale a TABELA da PARÂMETROS (é o preço que a casa pratica); acima disso não há
  // coluna, então segue a média medida nela — cada demão extra soma metade da primeira.
  const precoPintura = (cl) => (nDemaos <= 3 ? cl.demaos[iDemaos] : precoPinturaPorDemaos(cl.demaos[0], nDemaos));
  // ── PRÉ-MONTAGEM: por ÁREA ou por percentual ──
  // Vitor (23/08/2026): "na pré-montagem vale deixar selecionar as áreas que serão pré-montadas".
  //
  // ⚠ FAZ MAIS SENTIDO QUE UM PERCENTUAL SOLTO. Não se pré-monta "25% da obra" — pré-monta-se a
  // galeria e a treliça, que são as peças que vão inteiras para o canteiro. Escolhendo as áreas,
  // o percentual sai da conta em vez de ser adivinhado, e o peso pré-montado é o daquelas áreas,
  // não uma fatia teórica espalhada por todas.
  const areasPreMont = Array.isArray(c.preMontagemAreas) ? c.preMontagemAreas : null;
  const pesoPreMontPorClasse = {};
  let pesoPreMont = 0;
  if (areasPreMont?.length) {
    for (const l of resumos) {
      if (!areasPreMont.includes(l.area || l.item)) continue;
      const kg = n(l.pesoTotal ?? n(l.quantidade) * n(l.unidades || 1) * n(l.pesoUnit));
      pesoPreMont += kg;
      const cl = String(l.classificacao || "").toUpperCase();
      if (cl && cl !== "N/A") pesoPreMontPorClasse[cl] = (pesoPreMontPorClasse[cl] || 0) + kg;
    }
  }
  // o percentual continua existindo: é ele que escolhe a coluna de preço da PARÂMETROS
  const pctPre = areasPreMont?.length
    ? (pesoTotal > 0 ? r2((pesoPreMont / pesoTotal) * 100) : 0)
    : (c.preMontagemPct != null && c.preMontagemPct !== ""
      ? n(c.preMontagemPct)
      : (c.preMontagem === "PRÉ-MONT. 100%" ? 100 : c.preMontagem === "PRÉ-MONT. 10%" ? 10 : 0));
  const porClasse = (campo) => CLASSES.map((cl) => {
    const kg = pesoPorClasse[cl.nome.toUpperCase()] || 0;
    const preco = c.precos?.classe?.[cl.key]?.[campo]
      ?? (campo === "fabricacao" ? cl.fabricacao : campo === "pintura" ? precoPintura(cl) : precoPreMontagem(cl, pctPre));
    return { cl, kg, preco: n(preco) };
  });
  const fabricacao = porClasse("fabricacao").map((x) => linha(x.cl.nome, x.kg, x.preco, "TORG", "material", x.cl.faixa));
  const pintura = porClasse("pintura").map((x) => linha(x.cl.nome, x.kg, x.preco, "TORG", "material", `${nDemaos} ${nDemaos === 1 ? "demão" : "demãos"}`));
  // ⚠ escolhidas as áreas, só ELAS pesam na pré-montagem — não a obra inteira ponderada.
  const preMontagem = porClasse("preMont").map((x) => {
    const kg = areasPreMont?.length ? (pesoPreMontPorClasse[x.cl.nome.toUpperCase()] || 0) : x.kg;
    return linha(x.cl.nome, kg, x.preco, "TORG", "material",
      pctPre > 0 ? (areasPreMont?.length ? `${pctPre}% da obra` : `${pctPre}% pré-montado`) : "N/A");
  });

  const grupos = {
    materiaPrima: { linhas: materiaPrima, total: somar(materiaPrima) },
    fixadores: { linhas: fixadores, total: somar(fixadores) },
    tintas: { linhas: tintas, total: somar(tintas) },
    terceirizados: { linhas: terceirizados, total: somar(terceirizados) },
    fabricacao: { linhas: fabricacao, total: somar(fabricacao) },
    pintura: { linhas: pintura, total: somar(pintura) },
    preMontagem: { linhas: preMontagem, total: somar(preMontagem) },
  };
  const material = somar([grupos.materiaPrima.total, grupos.fixadores.total, grupos.tintas.total].map((t) => ({ ...t, nome: "" })));
  const mdo = grupos.terceirizados.total;
  const industrializacao = somar([grupos.fabricacao.total, grupos.pintura.total, grupos.preMontagem.total].map((t) => ({ ...t, nome: "" })));

  // ── PINTURA POR ÁREA: quanta tinta cada trecho consome ──
  // Vitor (23/08/2026): "trazer as áreas de pintura mencionadas na primeira parte e trazer a
  // quantidade de tinta que vamos usar em cada área".
  //
  // ⚠ A REGRA DE QUEM PEGA QUAL CAMADA VEM DO PRÓPRIO ESTUDO, e foi conferida na LQC-081: PRIMER
  // e INTERMEDIÁRIO cobrem todas as áreas do grupo de perda; ACABAMENTO só as da SUA COR. Confere
  // nos números: o primer de 45% cobre 75.854 m² (todas as áreas de 45%), e o acabamento cinza
  // cobre 25.023 m² — casa de transferência mais torres, as duas áreas cinza. Sem essa regra, ou
  // se pinta tudo de todas as cores, ou se esquece a cor da área.
  const norm = (x) => String(x || "").trim().toUpperCase();
  const pinturaPorArea = resumos.map((l) => {
    const kg = n(l.pesoTotal ?? n(l.quantidade) * n(l.unidades || 1) * n(l.pesoUnit));
    const area = n(l.areaM2) > 0 ? n(l.areaM2) : (n(l.coef) > 0 ? n(l.coef) : coefSugerido(l.perfil)) * kg;
    const pd = perdaDaLinha(l);
    const camadas = (c.tintas || [])
      .filter((t) => Number(t?.perda ?? 45) === pd)
      .filter((t) => (norm(t.camada) === "ACABAMENTO" ? norm(t.cor) === norm(l.cor) : true))
      .map((t) => {
        const calc = custoCamada({ ...t, perda: pd }, area);
        return {
          camada: t.camada, produto: t.produto || null, cor: t.cor || null,
          solidos: n(t.solidos) || null, peliculaSeca: n(t.peliculaSeca) || null,
          rendimento: calc.pratico, litros: calc.litros, litrosDiluente: calc.litrosDiluente,
          custo: calc.total,
        };
      });
    return {
      area: l.area || l.item || "—", cor: l.cor || null, perda: pd,
      pesoKg: r2(kg), areaM2: r2(area),
      peliculaTotal: camadas.reduce((a, x) => a + n(x.peliculaSeca), 0),
      litros: r2(camadas.reduce((a, x) => a + x.litros, 0)),
      litrosDiluente: r2(camadas.reduce((a, x) => a + x.litrosDiluente, 0)),
      custo: r2(camadas.reduce((a, x) => a + x.custo, 0)),
      camadas,
    };
  });

  // ── FRETE ──
  const cargas = cargasPorClasse(pesoPorClasse, c.frete?.capacidadePorClasse || {});
  const frete = calcularFrete(c.frete || {}, pesoTotal, cargas, fracaoEscopo);

  // ── ENSAIOS DA QUALIDADE ──
  // ⚠ entram no custo pelo VALOR FECHADO, não por R$/kg: ensaio se cobra por ensaio feito. O
  // R$/kg aparece só como leitura, e é ele que a linha 2.3 da LQC (Inspeção e Data Book) recebe.
  const ensaios = calcularEnsaios(c.ensaios || {}, pesoTotal, areaM2);
  ensaios.porKg = pesoTotal > 0 ? Math.round((ensaios.total / pesoTotal) * 10000) / 10000 : 0;

  // ── ITENS COMERCIAIS ──
  // ⚠ QUANTIDADE É POR ÁREA, senão não acompanha o escopo. Vitor (23/08/2026): "mesma coisa para
  // as abas para frente — a soma sai como se fosse para a obra toda ainda". Era verdade aqui:
  // telha e calha eram um número absoluto e continuavam inteiros mesmo com 70% da obra fora. É
  // também como a LQC faz (a aba QTDS ITENS COMERCIAIS é uma matriz área × família).
  //
  // `qtd` sem área continua valendo como "obra toda" — estudo antigo não perde o que foi digitado.
  const areasAtivas = new Set(resumos.map((l) => l.area || l.item).filter(Boolean));
  const comerciais = ITENS_COMERCIAIS.map((i) => {
    const cfg = c.itensComerciais?.[i.key] || {};
    const preco = cfg.preco == null ? i.preco : n(cfg.preco);
    const porAreaCfg = cfg.porArea || {};
    const temPorArea = Object.values(porAreaCfg).some((v) => n(v) > 0);
    const qtd = temPorArea
      ? Object.entries(porAreaCfg).reduce((a2, [area, v]) => a2 + (areasAtivas.has(area) ? n(v) : 0), 0)
      : n(cfg.qtd);
    return { ...i, qtd: r2(qtd), preco, porArea: porAreaCfg, porAreaTotal: temPorArea,
      // sem detalhe por área, o valor não acompanha o escopo — a tela precisa avisar
      naoAcompanha: !temPorArea && n(cfg.qtd) > 0 && resumos.length < todas.length,
      subtotal: r2(qtd * preco) };
  }).filter((i) => i.qtd > 0 || i.subtotal > 0);
  const totalComerciais = r2(comerciais.reduce((a, i) => a + i.subtotal, 0));

  // ── BDI e preço de venda, na conta da aba BDI ──
  //
  // ⚠ O BDI SÓ INCIDE SOBRE O QUE PASSA PELA TORG. Na planilha: `C18 = D18 × C7`, e C7 é a soma
  // do que está marcado TORG; o faturamento DIRETO entra na venda pelo valor de custo, sem
  // margem. Faz sentido — não se marca o que o cliente compra do fornecedor dele. Aplicar o BDI
  // sobre tudo inflava a proposta e explicava o preço errado que o Vitor viu.
  //
  // ⚠ E O BDI NÃO É UM NÚMERO SOLTO: é composto. `(1+adm+seguro+risco)/(1−(impostos+factoring+
  // margem+comissões))−1`. Um campo "BDI %" sozinho não chega na planilha, e foi por isso que a
  // PLANILHA COMERCIAL saiu sem BDI nenhum.
  const bdiCfg = c.bdi || {};
  const pct = (k) => n(bdiCfg[k]) / 100;
  const numerador = 1 + pct("administracao") + pct("seguro") + pct("risco");
  const denominador = 1 - (pct("impostos") + pct("factoring") + pct("margem") + pct("comissoes"));
  const bdi = denominador > 0 ? numerador / denominador - 1 : 0;

  const porFaturamento = (grupo) => grupo.linhas.reduce((a, l) => a + l.subtotal, 0);
  const ehTorg = (k) => String(fat[k] || "").toUpperCase() === "TORG";
  const ehDireto = (k) => String(fat[k] || "").toUpperCase() === "DIRETO";
  // só o material pode ser DIRETO; o serviço nosso cai sempre do lado da Torg
  const mapa = [["materiaPrima", grupos.materiaPrima], ["fixadores", grupos.fixadores], ["tintas", grupos.tintas]];
  // ⚠ declarado ANTES de ser usado: `const` e `let` não existem acima da própria linha, e o
  // build do Next não pega isso — só estoura na hora de calcular.
  let custoTorg = 0, custoDireto = 0, custoOutro = 0;
  const custoTorgServico = porFaturamento(grupos.fabricacao) + porFaturamento(grupos.pintura) + porFaturamento(grupos.preMontagem);
  for (const [k, g] of mapa) {
    const v = porFaturamento(g);
    if (ehTorg(k)) custoTorg += v; else if (ehDireto(k)) custoDireto += v; else custoOutro += v;
  }
  for (const l of grupos.terceirizados.linhas) {
    const f = String(l.faturamentoEscolhido || "").toUpperCase();
    if (f === "TORG") custoTorg += l.subtotal; else if (f === "DIRETO") custoDireto += l.subtotal; else custoOutro += l.subtotal;
  }
  // itens comerciais seguem o faturamento próprio; sem escolha, ficam com a Torg
  if (ehDireto("itensComerciais")) custoDireto += totalComerciais; else custoTorg += totalComerciais;
  // ensaios são serviço nosso: sempre do lado da Torg
  custoTorg += ensaios.total;
  // frete segue o faturamento escolhido — cliente que contrata o transporte dele não paga o nosso
  if (String(frete.faturamento).toUpperCase() === "DIRETO") custoDireto += frete.total;
  else custoTorg += frete.total;

  // ⚠ o que ficou "N/A" é custo nosso do mesmo jeito — entra no lado TORG, senão soma no custo e
  // some do preço, e a obra nasce com prejuízo embutido.
  custoTorg = r2(custoTorg + custoOutro + custoTorgServico);
  custoDireto = r2(custoDireto);

  const custo = r2(custoTorg + custoDireto);
  // ⚠ o preço com frete SEPARADO tem duas partes: a estrutura (com BDI) e o frete como item
  // próprio. Somar tudo num R$/kg só apagaria justamente a separação que o cliente pediu.
  const bdiValor = r2(custoTorg * bdi);
  const preco = r2(custoTorg + bdiValor + custoDireto);

  // ── impostos por linha de faturamento (quadro VALORES DE FATURAMENTO) ──
  const cfops = c.cfops || {};
  // ⚠ QUANTO DA VENDA SAI COMO "PROJETO" É NEGOCIAÇÃO, NÃO CONSTANTE. Vitor (23/08/2026): "de onde
  // você tirou o valor de 5% de projeto? Temos alguns acordos da forma de pagamento já negociados
  // com o cliente". Os 5% vieram da planilha dele (`BDI!G26 = K17 × 0,05`, linha "PROJETO — 5% DO
  // FAT. TORG") e eu copiei sem perguntar.
  //
  // E a diferença é dinheiro: projeto sai como SERVIÇO (ISS, CFOP 702, carga 18,33%) e
  // industrialização como INDUSTRIALIZAÇÃO PARA TERCEIRO (CFOP 5125, 14,96%). Mudar o percentual
  // muda o imposto do contrato inteiro — e cada cliente negocia esse desenho de um jeito. Vira
  // campo, com o 5% só como ponto de partida herdado da planilha.
  const vendaTorg = r2(custoTorg + bdiValor);
  const pctProjeto = c.faturamentoSplit?.projetoPct != null && c.faturamentoSplit.projetoPct !== ""
    ? n(c.faturamentoSplit.projetoPct) / 100
    : 0.05;
  // ⚠ AS BASES TÊM DE PARTIR A VENDA, NÃO SOMAR EM CIMA DELA. Vitor (23/08/2026): "estou achando
  // muito estranho esses números". Estava mesmo: a base de INDUSTRIALIZAÇÃO era `vendaTorg × 95%`
  // e a de MATERIAL era o material outra vez — só que o material JÁ está dentro da vendaTorg.
  // Medido na LQC-081: as bases somavam R$ 74,3 mi numa venda de R$ 54,7 mi, exatamente R$ 19,6 mi
  // a mais — o material inteiro, tributado duas vezes. Dava imposto de 23,8% do preço onde o BDI
  // reserva 17,3%, e ninguém veria de onde vinha a diferença.
  //
  // O rateio certo é o que a própria aba BDI faz no quadro DISTRIBUIÇÃO: cada linha leva o BDI na
  // proporção do seu custo ("BDI Proporcional"), e a soma das bases fecha com o preço.
  //
  // ⚠ e material que o CLIENTE compra direto não entra: a Torg não emite nota do que não vendeu.
  const materialTorg = mapa.reduce((a, [k, g]) => a + (ehDireto(k) ? 0 : porFaturamento(g)), 0);
  const comerciaisTorg = ehDireto("itensComerciais") ? 0 : totalComerciais;
  const comBdi = custoTorg > 0 ? vendaTorg / custoTorg : 1;
  const baseFaturamento = {
    ITENS_COMERCIAIS: r2(comerciaisTorg * comBdi),
    MATERIAL_IND: r2(materialTorg * comBdi),
    PROJETO: r2(vendaTorg * pctProjeto),
    MONTAGEM: n(c.montagem?.total),
    EQUIPAMENTOS: n(c.montagem?.equipamentos),
  };
  // o que sobra da venda depois das linhas próprias é industrialização — assim as bases fecham
  baseFaturamento.INDUSTRIALIZACAO = r2(Math.max(0,
    vendaTorg - baseFaturamento.ITENS_COMERCIAIS - baseFaturamento.MATERIAL_IND - baseFaturamento.PROJETO));
  const impostos = LINHAS_FATURAMENTO.map((l) => {
    const cod = cfops[l.key] || l.padrao;
    const base = r2(baseFaturamento[l.key] || 0);
    const carga = cargaDoCfop(cod);
    return { ...l, cfop: cod, base, cargaPct: r2(carga * 100), valor: r2(base * carga) };
  });
  const debitoImpostos = r2(impostos.reduce((a, i) => a + i.valor, 0));
  // ⚠ crédito só do que a TORG compra: o que o cliente compra direto nunca entrou por nossa nota.
  // ⚠ COMPRA EM NOME DO CLIENTE NÃO GERA CRÉDITO, e isso tem de ficar VISÍVEL. Vitor
  // (23/08/2026): "quando tivermos compra de material em nome do cliente esse cálculo não será
  // feito". Um crédito que simplesmente não aparece se confunde com um crédito esquecido.
  const semCredito = [
    ehDireto("materiaPrima") && "matéria-prima",
    ehDireto("fixadores") && "fixadores",
    ehDireto("tintas") && "tintas",
    ehDireto("itensComerciais") && "acessórios",
    String(c.frete?.faturamento || "TORG").toUpperCase() === "DIRETO" && "transporte",
  ].filter(Boolean);
  const credito = creditoDeIcms({
    materiaPrima: ehDireto("materiaPrima") ? 0 : porFaturamento(grupos.materiaPrima),
    fixadores: ehDireto("fixadores") ? 0 : porFaturamento(grupos.fixadores),
    tintas: ehDireto("tintas") ? 0 : porFaturamento(grupos.tintas),
    comerciais: comerciaisTorg,
    frete: String(c.frete?.faturamento || "TORG").toUpperCase() === "DIRETO" ? 0 : frete.total,
  }, c.creditoIcmsPct);
  credito.semCredito = semCredito;
  // ⚠ o que se PAGA é o líquido — é ele que tem de atravessar a cascata, o fluxo e o equilíbrio.
  const totalImpostos = r2(debitoImpostos - credito.total);
  // ⚠ CONFERÊNCIA VISÍVEL: as bases que saem da venda têm de somar o preço. Montagem e
  // equipamentos são digitados à parte e ficam fora da soma, por isso não entram aqui.
  const baseDaVenda = r2(baseFaturamento.ITENS_COMERCIAIS + baseFaturamento.MATERIAL_IND
    + baseFaturamento.PROJETO + baseFaturamento.INDUSTRIALIZACAO);
  const splitFaturamento = {
    baseDaVenda, fecha: Math.abs(baseDaVenda - vendaTorg) < 1,
    cargaEfetivaPct: preco > 0 ? r2((totalImpostos / preco) * 100) : 0,
    cargaBrutaPct: preco > 0 ? r2((debitoImpostos / preco) * 100) : 0,
    projetoPct: Math.round(pctProjeto * 10000) / 100,
    // ⚠ herdado = ninguém confirmou ainda; a tela pede a confirmação em vez de fingir que é regra
    projetoHerdado: c.faturamentoSplit?.projetoPct == null || c.faturamentoSplit?.projetoPct === "",
    vendaTorg,
  };

  return {
    pesoTotal: r2(pesoTotal), pesoPorClasse, pesoPorPerfil,
    // ⚠ CUSTO COMPLETO POR ÁREA — é o que vai para a proposta e o que decide qual pacote cortar.
    // Vitor (23/08/2026): "você trouxe o total da obra, não trouxe o peso separado por área que
    // selecionei". A LQC real faz assim: a PLANILHA COMERCIAL tem uma linha por área, e o cenário
    // mostra material / MDO terceirizada / industrialização de cada trecho, com o R$/kg dele.
    //
    // O que é da área vai direto (aço, tinta pela cor, terceiro amarrado ao trecho); o que é da
    // obra rateia por PESO — fixadores, ensaios e terceiro sem área. Conferido contra o estudo:
    // apoios e articulações dá R$ 3.488 mil de material e R$ 1.687 mil de industrialização, contra
    // R$ 3.488 mil e R$ 1.687 mil da planilha.
    porArea: (() => {
      const tintaPorArea = Object.fromEntries(pinturaPorArea.map((x) => [x.area, x.custo]));
      const terceiroDaArea = {};
      let terceiroGeral = 0;
      for (const l of grupos.terceirizados.linhas) {
        if (l.area) terceiroDaArea[l.area] = (terceiroDaArea[l.area] || 0) + l.subtotal;
        else terceiroGeral += l.subtotal;
      }
      // ⚠ frete e pré-montagem só rateiam quando são DILUÍDOS. Separados, viram linha própria da
      // proposta, e entrar no R$/kg da área os cobraria duas vezes.
      const freteKg = frete.apresentacao === "diluido" ? frete.porKg : 0;
      const preMontSeparada = c.preMontagemApresentacao === "separado";
      const fixadoresKg = pesoTotal > 0 ? grupos.fixadores.total.subtotal / pesoTotal : 0;
      const terceiroKg = pesoTotal > 0 ? terceiroGeral / pesoTotal : 0;
      const ensaiosKg = pesoTotal > 0 ? ensaios.total / pesoTotal : 0;

      const mapa = new Map();
      for (const l of todas) {
        const kg = n(l.pesoTotal ?? n(l.quantidade) * n(l.unidades || 1) * n(l.pesoUnit));
        const cl = CLASSE_POR_NOME[String(l.classificacao || "").toUpperCase()];
        const chave = l.area || l.item || "—";
        const ativo = l.ativo !== false;
        const g = mapa.get(chave) || {
          area: chave, ativo, cor: l.cor || null, classificacao: l.classificacao || null,
          pesoKg: 0, aco: 0, fabricacao: 0, pintura: 0, preMont: 0,
        };
        g.pesoKg += kg;
        g.aco += kg * n(l.precoKg);
        g.fabricacao += kg * n(cl?.fabricacao);
        g.pintura += kg * n(cl ? precoPintura(cl) : 0);
        g.preMont += kg * n(cl ? precoPreMontagem(cl, pctPre) : 0);
        mapa.set(chave, g);
      }
      return [...mapa.values()].map((g) => {
        // ⚠ área fora do escopo não recebe rateio: ela não consome fixador, ensaio nem frete.
        const rateio = g.ativo ? g.pesoKg : 0;
        const material = r2(g.aco + rateio * fixadoresKg + (g.ativo ? n(tintaPorArea[g.area]) : 0));
        const terceiros = r2((g.ativo ? n(terceiroDaArea[g.area]) : 0) + rateio * terceiroKg + rateio * ensaiosKg + rateio * freteKg);
        const industrializacao = r2(g.fabricacao + g.pintura + (preMontSeparada ? 0 : g.preMont));
        const custo = r2(material + terceiros + industrializacao);
        return {
          ...g, pesoKg: r2(g.pesoKg), material, terceiros, industrializacao, custo,
          custoPorKg: g.pesoKg > 0 ? r2(custo / g.pesoKg) : 0,
          // preço da área = custo × (1 + BDI), já que o BDI incide sobre o que a Torg fatura
          preco: r2(custo * (1 + bdi)),
          precoPorKg: g.pesoKg > 0 ? r2((custo * (1 + bdi)) / g.pesoKg) : 0,
        };
      }).sort((a, b) => b.pesoKg - a.pesoKg);
    })(),
    // quantas áreas entraram e quanto ficou de fora — para a tela dizer o escopo em uma linha
    escopo: {
      selecionadas: resumos.length, total: todas.length,
      pesoFora: r2(todas.filter((l) => l?.ativo === false)
        .reduce((a, l) => a + n(l.pesoTotal ?? n(l.quantidade) * n(l.unidades || 1) * n(l.pesoUnit)), 0)),
    },
    grupos, totais: { material, mdo, industrializacao, comerciais: totalComerciais, ensaios: ensaios.total },
    areaM2: r2(areaM2), ensaios, frete, cargas, pinturaPorArea,
    preMontagemPct: pctPre,
    preMont: {
      porArea: !!areasPreMont?.length,
      areas: areasPreMont || [],
      // ⚠ no modo percentual o peso é a obra INTEIRA — é assim na LQC: as linhas de pré-montagem
      // carregam todo o peso e o percentual só escolhe a coluna de preço. Mostrar 0 aqui daria a
      // impressão de que nada seria pré-montado.
      pesoKg: r2(areasPreMont?.length ? pesoPreMont : (pctPre > 0 ? pesoTotal : 0)),
      pctDaObra: pctPre,
      total: r2(grupos.preMontagem.total.subtotal),
      apresentacao: c.preMontagemApresentacao === "separado" ? "separado" : "diluido",
      porKg: pesoTotal > 0 ? Math.round((grupos.preMontagem.total.subtotal / pesoTotal) * 10000) / 10000 : 0,
    },
    custo, custoTorg, custoDireto,
    bdiPct: r2(bdi * 100), bdiValor, preco,
    impostos, totalImpostos, debitoImpostos, creditoIcms: credito,
    splitFaturamento, demaos: nDemaos, bdiCampos: c.bdi || {},
    // ⚠ o que SAI da empresa (material, terceiros, itens comerciais) — a industrialização não
    // entra: ela é a nossa fábrica, já paga pelo custo mensal da casa.
    custosExternos: r2(material.subtotal + mdo.subtotal + totalComerciais + frete.total),
    precoPorKg: pesoTotal > 0 ? r2(preco / pesoTotal) : 0,
  };
}

// ─── OS TRÊS CENÁRIOS ─────────────────────────────────────────────────────────
// Achado na LQC real (LQC-081-26-TMSA-VALE): a aba CENÁRIO FINANCEIRO do Comercial não é um
// fluxo — é uma ANÁLISE DE CENÁRIOS. As mesmas sete alavancas do BDI, em três colunas
// (Conservador · Base · Otimista), mais um fator de custo, e o que muda de lucro entre elas.
//
// ⚠ É ASSIM QUE UMA PROPOSTA É DEFENDIDA. Ninguém entra numa reunião com "a margem é 10%": entra
// sabendo quanto se pode ceder antes de a obra virar prejuízo. Na TMSA/VALE: margem 5% → BDI
// 33,9% e preço R$ 51,2 mi; margem 15% → BDI 54,6% e R$ 59,1 mi. A diferença de lucro entre os
// extremos é de R$ 6,3 milhões — é essa conta que decide o desconto que se pode dar.
export const CENARIOS = [
  { key: "conservador", nome: "Conservador" },
  { key: "base", nome: "Base" },
  { key: "otimista", nome: "Otimista" },
];

/** BDI a partir das alavancas — a fórmula da aba BDI. */
export function bdiDe(alavancas = {}) {
  const p = (k) => n(alavancas[k]) / 100;
  const num = 1 + p("administracao") + p("seguro") + p("risco");
  const den = 1 - (p("impostos") + p("factoring") + p("margem") + p("comissoes"));
  return den > 0 ? num / den - 1 : 0;
}

/** Os três cenários lado a lado, sobre o mesmo custo. */
export function analiseDeCenarios(custoTorg, custoDireto, cfg = {}) {
  const base = cfg.base || {};
  const linhas = CENARIOS.map((c) => {
    const al = { ...base, ...(cfg[c.key] || {}) };
    const fator = n(al.fatorCusto) > 0 ? n(al.fatorCusto) / 100 : 1;
    const custo = r2(n(custoTorg) * fator);
    const bdi = bdiDe(al);
    const bdiValor = r2(custo * bdi);
    const preco = r2(custo + bdiValor + n(custoDireto));
    const lucro = r2(preco * (n(al.margem) / 100));
    return {
      ...c, alavancas: al, custo, bdiPct: r2(bdi * 100), bdiValor, preco, lucro,
      margemPct: n(al.margem),
      // ⚠ o comercial pensa em R$/kg, não em milhões — é assim que se compara com a concorrência
      // e com a obra passada. Ficava zerado desde a primeira versão.
      precoPorKg: n(cfg.pesoKg) > 0 ? r2(preco / n(cfg.pesoKg)) : 0,
    };
  });
  const oBase = linhas.find((l) => l.key === "base");
  for (const l of linhas) l.deltaLucro = r2(l.lucro - (oBase?.lucro || 0));
  return linhas;
}

// ─── PRAZO: ATÉ QUANDO A OBRA AINDA DÁ LUCRO ──────────────────────────────────
// Vitor (23/08/2026): "para termos lucro, qual seria o prazo que poderíamos fazer?".
//
// ⚠ NÃO SE SOMA A INDUSTRIALIZAÇÃO COM O CUSTO OPERACIONAL — é a MESMA despesa contada duas
// vezes, e foi o erro da primeira versão desta conta. O CUSTO DA CASA é medido nas contas a pagar
// da própria Torg (lib/custo-casa.js): R$ 1.052.966/mês em 12 meses, já sem material, tinta,
// parafuso, frete, capex nem financeiro. É a casa inteira, por mês. A "industrialização" que o
// estudo cobra (fabricação + pintura + pré-montagem) é justamente a mão de obra dessa casa:
// cobrar as duas no mesmo custo é pagar a fábrica duas vezes.
//
// ⚠ E A TABELA COBRA MENOS DO QUE A CASA CUSTA: R$ 4,71/kg de industrialização contra R$ 7,97/kg
// de custo da casa por quilo processado. Quem cobre a diferença hoje é o BDI, sem aparecer.
//
// A conta certa separa o que SAI da empresa do que fica dentro:
//
//   receita − impostos − material − terceiros = SOBRA para pagar a casa e lucrar
//   prazo máximo = sobra ÷ custo mensal da casa
//
// ⚠ E A OCUPAÇÃO NÃO MUDA O RESULTADO. Ocupar metade da fábrica dobra o prazo e corta o custo
// atribuído pela metade — os dois lados andam junto, e a razão entre prazo e limite é a mesma.
// Quem muda se a obra fecha ou não é o PREÇO ou a CADÊNCIA, nunca a fatia ocupada.
export function prazoDeFabricacao({ pesoKg, preco, impostos, custosExternos }, cfg = {}) {
  const capacidade = n(cfg.capacidadeKgMes);
  const custoMes = n(cfg.custoOperacionalMes);
  if (capacidade <= 0 || custoMes <= 0) return null;

  const mesesPrevistos = n(pesoKg) / capacidade;
  const sobra = r2(n(preco) - n(impostos) - n(custosExternos));
  const mesesLimite = sobra / custoMes;
  const folga = mesesLimite - mesesPrevistos;

  return {
    capacidadeKgMes: capacidade, custoOperacionalMes: custoMes,
    mesesPrevistos: Math.round(mesesPrevistos * 10) / 10,
    sobra,
    mesesLimite: Math.round(mesesLimite * 10) / 10,
    folgaMeses: Math.round(folga * 10) / 10,
    fecha: folga >= 0,
    // o que precisaria mudar para fechar
    cadenciaNecessariaKgMes: mesesLimite > 0 ? Math.round(n(pesoKg) / mesesLimite) : 0,
    lucroNoPrazoReal: r2(sobra - mesesPrevistos * custoMes),
  };
}

// ─── FORMA DE PAGAMENTO ───────────────────────────────────────────────────────
// Vitor (23/08/2026): "para essas formas de pagamento vamos criar uma tela para, antes dos
// impostos, calcular isso — colocar as formas de pagamento para podermos gerar o cenário
// financeiro".
//
// ⚠ A FORMA DE PAGAMENTO É METADE DO NEGÓCIO. Duas propostas com o mesmo preço valem coisas
// diferentes: uma com 30% de entrada e outra sem entrada, com retenção de 5% liberada 90 dias
// depois da entrega, podem separar milhões de capital de giro. É o que se negocia depois que o
// preço fecha — e o que decide se a obra cabe no caixa.
//
// ⚠ E O QUE MANDA É QUANDO O DINHEIRO ENTRA, NÃO QUANDO SE FATURA. Medir no mês 3 e receber 30
// dias depois é caixa no mês 4. Sem o prazo da nota, o fluxo mente por um mês inteiro — e um mês
// inteiro de obra grande é o custo da casa por completo.
export const EVENTOS_PAGAMENTO = [
  { key: "ASSINATURA", nome: "Na assinatura", ajuda: "entrada, antes de começar" },
  // ⚠ Vitor (23/08/2026): "para projeto a mesma coisa, já temos o tempo definido, só dividir o
  // valor pelos meses". Projeto tem parcela própria em contrato de EPC, e ela entra antes de a
  // fábrica cortar — é justamente o que segura o caixa no começo.
  { key: "PROJETO", nome: "Durante o projeto", ajuda: "dividido pelos meses de projeto" },
  { key: "MEDICAO", nome: "Por medição", ajuda: "acompanha a produção, nos meses que medem" },
  { key: "ENTREGA", nome: "Na entrega", ajuda: "no último mês da obra" },
  { key: "POS_ENTREGA", nome: "Depois da entrega", ajuda: "retenção, garantia, aceite final" },
];

// ⚠ OS PRAZOS QUE A CASA PRATICA. Vitor (23/08/2026): "sobre o prazo de pagamento, descrever em
// cada linha a quantidade de dias — 7, 15, 21, 28, 60, 90, deixar esses como padrão". São os
// prazos que aparecem nos contratos; deixá-los a um clique evita o erro de digitar 3 quando se
// quis 30, que num fluxo de caixa some sem deixar rastro. Prazo fora da lista continua sendo
// aceito — é campo, não trava.
export const PRAZOS_PAGAMENTO = [7, 15, 21, 28, 60, 90];

export const PAGAMENTO_PADRAO = [
  { nome: "Entrada", pct: 10, evento: "ASSINATURA", dias: 0 },
  { nome: "Medições mensais", pct: 80, evento: "MEDICAO", dias: 30 },
  { nome: "Entrega", pct: 10, evento: "ENTREGA", dias: 30 },
];

/** Confere a forma de pagamento: soma, adiantamento e retenção. */
export function conferirPagamento(cfg = {}) {
  const parcelas = Array.isArray(cfg.parcelas) && cfg.parcelas.length ? cfg.parcelas : PAGAMENTO_PADRAO;
  const soma = r2(parcelas.reduce((a, p) => a + n(p.pct), 0));
  return {
    parcelas, soma,
    fecha: Math.abs(soma - 100) < 0.01,
    // ⚠ o que entra antes de começar é o que financia a compra do material
    adiantadoPct: r2(parcelas.filter((p) => p.evento === "ASSINATURA").reduce((a, p) => a + n(p.pct), 0)),
    retidoPct: r2(parcelas.filter((p) => p.evento === "POS_ENTREGA").reduce((a, p) => a + n(p.pct), 0)),
  };
}

// ─── O DINHEIRO: QUEM PAGA O MATERIAL ATÉ O CLIENTE PAGAR ─────────────────────
// Vitor (23/08/2026): "só que você levou em consideração que vamos precisar comprar o material
// todo dessa obra?".
//
// Não tinha levado. A conta de prazo tratava o material como um custo qualquer, subtraído da
// receita — mas material não é só valor, é MOMENTO. Na TMSA são R$ 20,3 milhões de aço, tinta e
// fixador que saem do nosso caixa antes de o cliente medir a primeira peça. Entre pagar o
// fornecedor e receber a medição, quem banca é a Torg.
//
// ⚠ E ISSO TEM PREÇO. O BDI reserva uma linha de "despesas financeiras (factoring)" — se ela for
// menor que o juro real do período, a diferença sai do lucro sem aparecer em lugar nenhum. Numa
// obra de dois anos com material por nossa conta, 3% sobre a venda pode não cobrir 24 meses de
// dinheiro parado. Esta função existe para esse número deixar de ser palpite.
//
// A regra do fluxo:
//   material    comprado nos primeiros meses, pago no prazo do fornecedor
//   fábrica     custo mensal da casa, do primeiro ao último mês
//   terceiros   junto com a produção
//   impostos    no mês em que se fatura
//   recebimento entrada na assinatura · medições acompanhando a produção · saldo na entrega
export function fluxoDeCaixa(dados, cfg = {}) {
  // ⚠ OBRA NÃO COMEÇA PRODUZINDO. Vitor (23/08/2026): "a obra terá prazo de 9 meses — no primeiro
  // mês vamos fazer projeto apenas, no segundo é que vamos começar a produzir, e daí é que começa
  // nosso prazo de fabricação". A versão anterior punha a fábrica rodando no mês 1 e o caixa
  // enxergava produção e medição um mês antes da hora. Num contrato grande, um mês de erro no
  // início desloca o pior mês inteiro e subestima o capital de giro.
  const projeto = Math.max(0, Math.round(n(dados.mesesProjeto)));
  const fabrica = Math.max(1, Math.ceil(n(dados.meses) || 1));
  // ⚠ PROJETO E FABRICAÇÃO PODEM ANDAR JUNTOS. Vitor (23/08/2026): "e se eu quiser começar a
  // produção em meses que ainda teremos evento de projeto? A fabricação está iniciando no mês 4 e
  // se eu produzir alguma coisa no mês 2?".
  //
  // É o que acontece de verdade: a engenharia libera um pacote e a fábrica já corta enquanto o
  // detalhamento das outras áreas continua. Amarrar a fabricação ao FIM do projeto empurrava a
  // obra inteira para frente e inventava meses de caixa parado que não existem. Agora o início da
  // fabricação é campo próprio; sobrepondo, o mês carrega os dois custos — que é o certo, porque
  // nele a engenharia está trabalhando E a fábrica está produzindo.
  const m1 = Math.max(1, Math.round(n(dados.mesInicioFabricacao)) || projeto + 1);
  const mN = m1 + fabrica - 1;                   // último mês de fabricação = entrega
  const meses = Math.max(projeto, mN);           // prazo do contrato, ponta a ponta

  const taxa = n(cfg.taxaMensalPct) / 100;
  const pag = conferirPagamento(cfg.pagamento || {});
  // ⚠ o horizonte tem de comportar a parcela mais tardia: retenção liberada 90 dias após a
  // entrega não pode cair fora da tabela e sumir do saldo.
  const maisTarde = Math.max(...pag.parcelas.map((p) => (p.evento === "POS_ENTREGA" ? mN + Math.ceil(n(p.dias) / 30) : 0)), 0);
  const horizonte = Math.max(meses + 2, maisTarde + 1);

  const entradas = new Array(horizonte + 1).fill(0);
  // ⚠ RECEITA PRECISA DIZER DE ONDE VEM. Vitor (23/08/2026): "nos meses que temos recebimento de
  // projeto e fabricação você traz apenas as receitas que são do projeto". A soma estava certa — o
  // que faltava era o número dizer do que é feito: num mês rotulado "projeto + fabricação" que
  // mostra só a parcela do projeto, é impossível saber se a medição atrasou 30 dias, se o mês foi
  // marcado como sem medição, ou se o portal esqueceu.
  const receitaDe = {
    entrada: new Array(horizonte + 1).fill(0),
    projeto: new Array(horizonte + 1).fill(0),
    medicao: new Array(horizonte + 1).fill(0),
    entrega: new Array(horizonte + 1).fill(0),
  };
  // ⚠ O DESEMBOLSO PRECISA SER LEGÍVEL LINHA A LINHA. Vitor (23/08/2026): "não estou vendo o custo
  // do material no fluxo". Estava lá, somado dentro de um total só — e material é a maior saída da
  // obra e a que tem prazo próprio de fornecedor. Num total agregado ninguém confere nada: não dá
  // para ver se a compra caiu no mês certo nem se as parcelas pousaram onde deviam.
  const linhas = {
    projeto: new Array(horizonte + 1).fill(0),
    material: new Array(horizonte + 1).fill(0),
    fabrica: new Array(horizonte + 1).fill(0),
    impostos: new Array(horizonte + 1).fill(0),
  };

  // ── projeto: a engenharia roda antes de qualquer quilo ser cortado ──
  // ⚠ e é dinheiro que sai sem nada entrar, o trecho mais caro do fluxo em juro.
  for (let m = 1; m <= projeto; m++) linhas.projeto[m] += n(dados.custoProjetoMes);

  // ── material: a compra começa ANTES da fabricação ──
  // ⚠ Vitor (23/08/2026): "vamos considerar que a obra tenha 4 meses, preciso comprar o material
  // um mês antes de iniciarmos". Sem isso o aço chegava junto com a primeira peça cortada — que é
  // impossível — e o caixa via a saída um mês tarde demais.
  const compraAntes = Math.max(0, Math.round(n(cfg.compraMesesAntes)));
  const inicioCompra = Math.max(0, m1 - compraAntes);
  const mesesCompra = Math.max(1, Math.round(n(cfg.mesesCompraMaterial) || Math.ceil(fabrica * 0.3)));
  // ⚠ E O FORNECEDOR PARCELA. "O pagamento dos materiais são 28/42/56": três parcelas iguais, e
  // não um prazo só. Tratar como prazo único joga o desembolso inteiro num mês e inventa um pico
  // de capital de giro que não existe.
  const dias = Array.isArray(cfg.parcelasFornecedor) && cfg.parcelasFornecedor.length
    ? cfg.parcelasFornecedor.map((d) => Math.max(0, n(d)))
    : [Math.max(0, n(cfg.prazoFornecedorDias) || 30)];
  const fatia = 1 / dias.length;
  const material = n(dados.material);
  for (let i = 0; i < mesesCompra; i++) {
    const mesDaCompra = inicioCompra + i;
    for (const d of dias) {
      // ⚠ o fluxo é MENSAL: 28 e 42 dias caem no mesmo mês seguinte, 56 cai no outro. A tela
      // mostra em que mês cada parcela pousou, para ninguém achar que sumiu.
      const quando = Math.min(horizonte, Math.max(0, mesDaCompra + Math.round(d / 30)));
      linhas.material[quando] += (material / mesesCompra) * fatia;
    }
  }

  // ── fábrica e terceiros: só nos meses em que se produz ──
  const porMes = (n(dados.terceiros) + n(dados.custoOperacionalMes) * fabrica) / fabrica;
  for (let m = m1; m <= mN; m++) linhas.fabrica[Math.min(horizonte, m)] += porMes;

  // ── recebimento ──
  // ⚠ receita digitada GANHA da regra: quando o cliente já negociou o cronograma de medição, a
  // distribuição por evento é palpite ao lado do que está no contrato.
  const preco = n(dados.preco);
  const quando = (m) => Math.max(0, Math.min(horizonte, m));
  // ⚠ meses de FABRICAÇÃO sem medição, contados a partir de 1 dentro da fabricação
  const semMedicao = new Set((Array.isArray(cfg.mesesSemMedicao) ? cfg.mesesSemMedicao : []).map((x) => Math.round(n(x))));
  const medindo = [];
  // ⚠ o índice é o mês DA FABRICAÇÃO (1, 2, 3...), contado do início dela — não do contrato. Com
  // projeto e fabricação sobrepostos, contar pelo projeto trocava os meses de lugar.
  for (let m = m1; m <= mN; m++) if (!semMedicao.has(m - m1 + 1)) medindo.push(m);

  // ── O PREÇO POR QUILO FATURADO ──────────────────────────────────────────────
  // Vitor (23/08/2026): "quando temos entrada, projeto e já sabemos que temos 1% que vai ficar
  // retido pós-entrega, precisamos ter um campo de kg produzido em cada mês para gerar a receita.
  // Você vai pegar o valor que falta faturar e dividir por kg — esse valor dividido por kg
  // teríamos o preço por kg fabricado, e aí nos meses que marco que tem medição já teríamos o
  // valor por mês de faturamento".
  //
  // ⚠ É ASSIM QUE MEDIÇÃO FUNCIONA DE VERDADE: fatura-se o que se PRODUZIU, não uma fatia igual do
  // contrato. Entrada, projeto, entrega e retenção saem por cima; o que sobra é o que passa pela
  // balança. Dividir o saldo por fatias iguais dá receita certa no total e errada em todo mês —
  // e é no mês, não no total, que o caixa quebra.
  const pesoKg = n(dados.pesoKg);
  const valorMedicao = pag.parcelas
    .filter((p) => p.evento === "MEDICAO")
    .reduce((a, p) => a + n(dados.preco) * (n(p.pct) / 100), 0);
  // ⚠ divide pelo peso da OBRA, não pela soma do que foi digitado: se os dois não fecharem, a
  // diferença TEM de aparecer como falta ou sobra de faturamento, não sumir num preço ajustado.
  const precoPorKgFaturado = pesoKg > 0 ? valorMedicao / pesoKg : 0;
  const kgMes = Array.isArray(cfg.kgPorMes) ? cfg.kgPorMes.map((v) => Math.max(0, n(v))) : [];
  const temKg = kgMes.some((v) => v > 0);

  // ── O QUE SE PRODUZ E O QUE SE MEDE SÃO DUAS COISAS ─────────────────────────
  // Vitor (23/08/2026): "nos meses que eu marcar como não mede, você deve deixar esse valor em
  // aberto e eu posso distribuir isso em um mês, ou vamos distribuir em alguns meses".
  //
  // ⚠ ANTES O SALDO IA INTEIRO PARA A MEDIÇÃO SEGUINTE, e isso é só o caso mais comum — não é
  // regra. Quando dois meses ficam sem medir, o terceiro vinha com uma medição gigante que o
  // cliente muitas vezes não aprova de uma vez. Agora o que se produziu fica EM ABERTO e a
  // distribuição é escolha: digita-se quanto medir em cada mês, e o resto continua em aberto.
  const medidoDigitado = Array.isArray(cfg.kgMedidoPorMes) ? cfg.kgMedidoPorMes.map((v) => Math.max(0, n(v))) : [];
  const kgMedido = new Array(horizonte + 1).fill(0);
  const emAberto = new Array(horizonte + 1).fill(0);
  const kgProduzido = new Array(horizonte + 1).fill(0);
  let saldoAberto = 0, produzidoAcum = 0, kgExcedente = 0;
  for (let m = m1; m <= mN; m++) {
    // ⚠⚠ NUNCA SE PRODUZ MAIS DO QUE A OBRA TEM. Vitor (23/08/2026): "você está considerando o
    // valor de faturamento de 37 milhões no cenário financeiro — você deve ter deixado a lógica
    // para os valores totais da obra".
    //
    // Estava certo, e a causa é sutil: o kg digitado mês a mês NÃO acompanha o escopo. Desmarcada
    // uma área, o preço cai e o peso cai — mas o cronograma de produção continua com os quilos do
    // levantamento inteiro. Como a receita é kg × (saldo ÷ peso da obra), o preço por quilo SOBE ao
    // mesmo tempo em que os quilos ficam grandes demais, e o faturamento estoura duas vezes.
    // Medido: escopo cortado para 1.900.690 kg, preço R$ 43.893.724, e o fluxo faturava
    // R$ 51.984.316 — R$ 8 milhões que não existem em contrato nenhum.
    const cabe = Math.max(0, pesoKg - produzidoAcum);
    const bruto = kgMes[m] || 0;
    const produzido = pesoKg > 0 ? Math.min(bruto, cabe) : bruto;
    kgExcedente += bruto - produzido;
    produzidoAcum += produzido;
    kgProduzido[m] = produzido;
    saldoAberto += produzido;
    // ⚠ o valor digitado GANHA da caixinha: digitar é sinal mais forte que marcar, e nunca se mede
    // mais do que está em aberto — medição não fatura o que a fábrica ainda não fez.
    const medir = medidoDigitado[m] > 0 ? Math.min(saldoAberto, medidoDigitado[m])
      : (medindo.includes(m) ? saldoAberto : 0);
    kgMedido[m] = medir;
    saldoAberto -= medir;
    emAberto[m] = saldoAberto;
  }
  const abertoFinal = saldoAberto;

  const manual = Array.isArray(cfg.receitaPorMes) ? cfg.receitaPorMes : null;
  const temManual = manual && manual.some((v) => n(v) > 0);
  // ⚠ declarado FORA do bloco: `const` dentro de `{ }` não existe no return, e o `next build` não
  // pega isso — só a execução real pega.
  const eventosDesconhecidos = [];
  {
    // ⚠⚠ A MEDIÇÃO SE CALCULA UMA VEZ SÓ — NÃO DENTRO DO LAÇO DAS PARCELAS. Este laço já esteve
    // errado e o erro era grave: o ramo da medição rodava A CADA PARCELA e somava o `valorMedicao`
    // INTEIRO de novo, porque `valorMedicao` já é a soma de todas as linhas de MEDIÇÃO. Duas linhas
    // de medição faturavam R$ 81 mi num contrato de R$ 45 mi; três, R$ 117 mi. E bastava a linha
    // EXISTIR — o percentual dela nem importava, uma linha em 0% dobrava o faturamento. Pior: o
    // capital de giro caía 72% e o juro 90%, que são exatamente os números que decidem se a obra
    // cabe no caixa.
    //
    // ⚠ E EVENTO DESCONHECIDO NÃO PODE CAIR NA MEDIÇÃO. Um dado antigo salvo com outro nome, ou um
    // evento novo que alguém acrescente, caía no `else` e injetava outra medição cheia. Agora cada
    // evento é tratado pelo nome, e o que não se reconhece vai para a ENTREGA — que é o lugar
    // conservador: atrasa o dinheiro em vez de antecipá-lo.
    let valorMedicaoRegra = 0, atrasoMedicao = 0;
    for (const p of pag.parcelas) {
      const valor = preco * (n(p.pct) / 100);
      const atraso = Math.round(n(p.dias) / 30);
      if (p.evento === "ASSINATURA") { entradas[quando(atraso)] += valor; receitaDe.entrada[quando(atraso)] += valor; }
      else if (p.evento === "ENTREGA" || p.evento === "POS_ENTREGA") { entradas[quando(mN + atraso)] += valor; receitaDe.entrega[quando(mN + atraso)] += valor; }
      else if (p.evento === "PROJETO") {
        const n0 = Math.max(1, projeto);
        for (let m = 1; m <= n0; m++) { entradas[quando(m + atraso)] += valor / n0; receitaDe.projeto[quando(m + atraso)] += valor / n0; }
      } else if (p.evento === "MEDICAO") {
        // acumula e distribui depois: o prazo é o da última linha de medição lançada
        valorMedicaoRegra += valor;
        atrasoMedicao = atraso;
      } else {
        eventosDesconhecidos.push(p.nome || p.evento || "sem evento");
        entradas[quando(mN + atraso)] += valor;
        receitaDe.entrega[quando(mN + atraso)] += valor;
      }
    }

    // ── MEDIÇÃO, UMA VEZ ────────────────────────────────────────────────────
    // ⚠ SÓ NOS MESES QUE MEDEM. Vitor (23/08/2026): "no mês 1 da fabricação não teremos medição, e
    // pode ser que o segundo também não". É o normal: o primeiro mês corta e prepara, e não há peça
    // pronta para medir. Espalhar por igual desde o mês 1 antecipa receita que não existe e esconde
    // o buraco de caixa exatamente onde ele é maior.
    if (temKg) {
      for (let m = m1; m <= mN; m++) {
        if (!kgMedido[m]) continue;
        const v = kgMedido[m] * precoPorKgFaturado;
        entradas[quando(m + atrasoMedicao)] += v;
        receitaDe.medicao[quando(m + atrasoMedicao)] += v;
      }
      // ⚠ o que ficou EM ABERTO no fim da obra fecha na entrega — não some
      if (abertoFinal > 0) {
        const v = abertoFinal * precoPorKgFaturado;
        entradas[quando(mN + atrasoMedicao)] += v;
        receitaDe.medicao[quando(mN + atrasoMedicao)] += v;
      }
    } else if (medindo.length && valorMedicaoRegra > 0) {
      for (const m of medindo) {
        entradas[quando(m + atrasoMedicao)] += valorMedicaoRegra / medindo.length;
        receitaDe.medicao[quando(m + atrasoMedicao)] += valorMedicaoRegra / medindo.length;
      }
    }
  }

  // ⚠ AJUSTE MANUAL SOBREPÕE O MÊS, NÃO SUBSTITUI O CRONOGRAMA. Antes, um único valor digitado
  // fazia o portal descartar a regra inteira e zerar todos os outros meses — quem quisesse
  // corrigir um mês perdia os onze restantes sem ver. Agora a conta roda sempre, e o que se
  // digita troca só aquele mês.
  // ⚠ VALOR ALÉM DO FIM DA OBRA É IGNORADO, NÃO EMPILHADO NO ÚLTIMO MÊS. Grudar no horizonte
  // criaria um pico de receita que não existe — e é fácil sobrar valor antigo aqui quando o prazo
  // da obra encurta depois de alguém já ter digitado.
  let ignorados = 0;
  if (temManual) manual.forEach((v, m) => {
    if (n(v) <= 0) return;
    if (m > horizonte) { ignorados += n(v); return; }
    entradas[m] = n(v);
  });

  // imposto sai no mês em que se fatura, sobre o que foi faturado
  const faturado = entradas.reduce((a, b) => a + b, 0);
  const aliqImposto = faturado > 0 ? n(dados.impostos) / faturado : 0;
  for (let m = 0; m <= horizonte; m++) linhas.impostos[m] += entradas[m] * aliqImposto;
  const saidas = linhas.projeto.map((_, m) => linhas.projeto[m] + linhas.material[m] + linhas.fabrica[m] + linhas.impostos[m]);

  const fluxo = [];
  let saldo = 0, pico = 0, juros = 0, mesPico = 0;
  for (let m = 0; m <= horizonte; m++) {
    const j = saldo < 0 ? -saldo * taxa : 0;
    juros += j;
    saldo = saldo - j + entradas[m] - saidas[m];
    if (saldo < pico) { pico = saldo; mesPico = m; }
    fluxo.push({
      mes: m, entrada: r2(entradas[m]), saida: r2(saidas[m]), juros: r2(j), saldo: r2(saldo),
      // ⚠ cada saída com nome próprio: material tem prazo de fornecedor, fábrica acompanha a
      // produção, imposto acompanha o faturamento. Somados, escondem os três.
      projeto: r2(linhas.projeto[m]), material: r2(linhas.material[m]),
      fabrica: r2(linhas.fabrica[m]), impostos: r2(linhas.impostos[m]),
      // ⚠ a receita aberta por origem: num mês de projeto + fabricação, dá para ver quanto é de cada
      de: { entrada: r2(receitaDe.entrada[m]), projeto: r2(receitaDe.projeto[m]), medicao: r2(receitaDe.medicao[m]), entrega: r2(receitaDe.entrega[m]) },
      kgProduzido: r2(kgProduzido[m] || 0),
      kgMedido: r2(kgMedido[m] || 0), emAberto: r2(emAberto[m] || 0),
      // ⚠ a fase deixa o mês legível: "projeto" explica desembolso sem receita sem parecer erro
      // ⚠ mês que é as duas coisas precisa DIZER que é as duas: senão o desembolso dobrado parece erro
      fase: m === 0 ? "assinatura"
        : m <= projeto && m >= m1 && m <= mN ? "projeto + fabricação"
        : m <= projeto ? "projeto"
        : m >= m1 && m <= mN ? "fabricação"
        : "pós-entrega",
    });
  }

  const reservado = n(dados.reservaFinanceira);
  return {
    meses, mesesProjeto: projeto, mesesFabricacao: fabrica, mesInicioFabricacao: m1, mesEntrega: mN,
    // quantos meses o projeto e a fábrica rodam ao mesmo tempo
    mesesSobrepostos: Math.max(0, Math.min(projeto, mN) - m1 + 1),
    // meses do contrato em que há medição, e em que mês cada parcela do fornecedor pousa
    mesesQueMedem: medindo,
    // ⚠ o quadro que o comercial precisa ver: o que sai por cima e o que passa pela balança
    medicao: {
      // valor que NÃO passa por medição — entrada, projeto, entrega e retenção
      foraDaMedicao: r2(n(dados.preco) - valorMedicao),
      saldoAFaturar: r2(valorMedicao),
      pesoKg: r2(pesoKg),
      precoPorKg: pesoKg > 0 ? Math.round((valorMedicao / pesoKg) * 100) / 100 : 0,
      porKgDigitado: temKg,
      kgInformado: r2(kgMes.reduce((a, b) => a + b, 0)),
      // ⚠ kg digitado que não fecha com o peso da obra é receita que ninguém vai faturar
      kgFaltando: temKg ? r2(pesoKg - kgMes.reduce((a, b) => a + b, 0)) : 0,
      // ⚠ o que foi digitado além do peso da obra e NÃO entrou em faturamento nenhum
      kgExcedente: r2(kgExcedente),
      // ⚠ produzido que ficou sem medir no fim da obra: fecha na entrega, mas precisa ser visto
      abertoNaEntrega: r2(abertoFinal),
    },
    compra: { inicio: inicioCompra, meses: mesesCompra, parcelas: dias.map((d) => ({ dias: d, mes: Math.round(d / 30) })) },
    fluxo, pagamento: pag,
    // meses com valor ajustado à mão (a conta continua valendo nos demais)
    receitaDigitada: !!temManual,
    mesesAjustados: temManual ? manual.map((v, m) => (n(v) > 0 && m <= horizonte ? m : -1)).filter((m) => m >= 0) : [],
    // valor digitado para um mês que não existe mais no prazo — some da conta, e a tela avisa
    receitaForaDoPrazo: r2(ignorados),
    // ⚠ parcela com evento que o portal não conhece: foi lançada na entrega, e a tela precisa dizer
    eventosDesconhecidos,
    faturado: r2(faturado),
    // ⚠ o faturamento tem de fechar com o preço SEMPRE, não só quando alguém digita: kg faltando,
    // mês sem medição no fim da obra ou ajuste à mão furam o total do mesmo jeito, e a diferença
    // some no meio de uma tabela de doze linhas.
    diferencaFaturamento: r2(faturado - preco),
    capitalDeGiro: r2(-pico), mesDoPico: mesPico,
    // totais por linha, para o rodapé conferir contra a composição
    totais: {
      projeto: r2(linhas.projeto.reduce((a, b) => a + b, 0)),
      material: r2(linhas.material.reduce((a, b) => a + b, 0)),
      fabrica: r2(linhas.fabrica.reduce((a, b) => a + b, 0)),
      impostos: r2(linhas.impostos.reduce((a, b) => a + b, 0)),
    },
    custoFinanceiro: r2(juros),
    reservadoNoBdi: r2(reservado),
    // ⚠ o que o BDI reservou menos o que o dinheiro custou. Negativo = está saindo do lucro.
    diferenca: r2(reservado - juros),
    resultadoFinal: r2(saldo),
  };
}

// ─── DO PREÇO AO RESULTADO ────────────────────────────────────────────────────
// Vitor (23/08/2026): "no cenário financeiro parece muito genérico, precisa melhorar as
// informações".
//
// ⚠ ESTAVA GENÉRICO PORQUE O "LUCRO" ERA UMA REPETIÇÃO DO QUE SE DIGITOU. A tabela mostrava
// `lucro = preço × margem do BDI` — ou seja, devolvia a alavanca. Margem 10% → "lucro 10%".
// Isso não é informação: é o eco do campo. O que decide uma proposta é o caminho inteiro,
// do preço até o que sobra:
//
//   preço − impostos − o que SAI da empresa − a casa pelos meses de obra − o dinheiro parado
//
// E o confronto entre as duas margens é o número mais útil da tela: a MARGEM PRETENDIDA é o que
// o BDI promete; a MARGEM REAL é o que sobra quando se cobra a fábrica pelo custo medido dela,
// e não pela tabela de preços. Quando a real vem acima da pretendida, a tabela está recuperando
// mais do que a casa custa — e isso é espaço de desconto que ninguém sabia que tinha.

/** Imposto de um cenário: linha fixa não se mexe, linha que sai da venda acompanha o preço. */
export function impostosDoCenario(res, vendaTorg) {
  const atual = n(res?.splitFaturamento?.vendaTorg);
  const fator = atual > 0 ? n(vendaTorg) / atual : 1;
  // ⚠ só PROJETO e INDUSTRIALIZAÇÃO saem da venda; itens comerciais, material revendido, montagem
  // e equipamentos têm base própria e não acompanham o BDI. Escalar tudo pelo preço inflaria o
  // imposto de coisas que não mudaram de valor.
  const variavel = (k) => k === "PROJETO" || k === "INDUSTRIALIZACAO";
  const linhas = (res?.impostos || []).map((l) => {
    const base = r2(n(l.base) * (variavel(l.key) ? fator : 1));
    return { ...l, base, valor: r2(base * (n(l.cargaPct) / 100)) };
  });
  const debito = r2(linhas.reduce((a, l) => a + l.valor, 0));
  // ⚠ O CRÉDITO NÃO ACOMPANHA O PREÇO: ele vem das COMPRAS, que não mudam quando o BDI muda. Por
  // isso entra inteiro no lado fixo — e é o que faz o preço de equilíbrio cair de verdade.
  const credito = n(res?.creditoIcms?.total);
  const total = r2(debito - credito);
  const daVenda = r2(linhas.filter((l) => variavel(l.key)).reduce((a, l) => a + l.valor, 0));
  return {
    linhas, total, debito, credito, fixo: r2(total - daVenda),
    // ⚠ a carga MARGINAL: de cada real a mais de preço, quanto vira imposto. É ela que manda no
    // ponto de equilíbrio — a carga média sobre o total mentiria, porque metade da base é fixa.
    cargaMarginal: n(vendaTorg) > 0 ? daVenda / n(vendaTorg) : 0,
  };
}

/**
 * O resultado de verdade de um cenário.
 *
 * ⚠ A CASA ENTRA PELO CUSTO MEDIDO, NÃO PELA TABELA. A industrialização que o estudo cobra
 * (fabricação + pintura + pré-montagem) é o PREÇO da nossa mão de obra; o que ela custa é o
 * custo mensal da fábrica pelos meses que a obra ocupa. Somar as duas é pagar a fábrica duas
 * vezes — foi o erro da primeira versão da conta de prazo.
 */
export function resultadoDoCenario(res, cen, cfg = {}) {
  const preco = n(cen?.preco);
  const custoDireto = n(res?.custoDireto);
  const imp = impostosDoCenario(res, r2(preco - custoDireto));

  const material = r2(n(res?.totais?.material?.subtotal) * (1 + n(cfg.acoPct) / 100));
  const outrosExternos = r2(n(res?.custosExternos) - n(res?.totais?.material?.subtotal));
  const externos = r2(material + outrosExternos);

  // ── QUANTOS MESES DE FÁBRICA ESTA OBRA CARREGA ──────────────────────────────
  // Vitor (23/08/2026): "nos meses que de fato eu começo a produção, o ideal não seria trazer os
  // custos da operação integral nesse caso?".
  //
  // ⚠ E A PERGUNTA EXPÔS UM FURO: a cascata cobrava a casa por PESO ÷ CADÊNCIA e o fluxo cobrava
  // pelos MESES DIGITADOS. Dois números diferentes na mesma tela, e ninguém percebia porque cada
  // um vivia num quadro.
  //
  // São duas coisas distintas, e as duas importam:
  //   CONSUMO   peso ÷ cadência — quantos meses de fábrica esta obra come
  //   CONTRATO  o prazo de fabricação negociado, que é o que o calendário dá
  //
  // Quando o contrato dá mais tempo do que a obra consome, a diferença é fábrica disponível para
  // outra obra — ou ociosidade paga. Quem decide é a OCUPAÇÃO: 100% é fábrica dedicada e a
  // obra paga a casa inteira pelos meses do contrato; o padrão rateia pelo que ela de fato come.
  const capacidade = n(cfg.capacidadeKgMes);
  const mesesConsumo = capacidade > 0 ? Math.round((n(res?.pesoTotal) / capacidade) * 10) / 10 : n(cfg.meses);
  const mesesContrato = n(cfg.mesesFabricacao) > 0 ? n(cfg.mesesFabricacao) : mesesConsumo;
  const meses = Math.round((mesesContrato + n(cfg.mesesExtra)) * 10) / 10;
  // ⚠ sem escolha explícita, a obra carrega o que CONSOME — cobrar a fábrica inteira por um prazo
  // folgado embutiria no preço a ociosidade que o comercial deveria estar vendendo para outro.
  const ocupacao = cfg.ocupacaoPct == null || cfg.ocupacaoPct === ""
    ? (meses > 0 ? Math.min(1, mesesConsumo / meses) : 1)
    : Math.max(0, n(cfg.ocupacaoPct) / 100);
  const casa = r2(meses * n(cfg.custoOperacionalMes) * ocupacao);
  const financeiro = r2(n(cfg.custoFinanceiro));
  // ⚠ O PROJETO É CUSTO E VEM ANTES DE TUDO. Vitor (23/08/2026): "no primeiro mês vamos fazer
  // projeto apenas". É desembolso sem produção e sem medição — deixá-lo fora do resultado dá
  // lucro que a obra não tem, e ainda esconde o pedaço mais caro do fluxo em juro.
  const mesesProjeto = Math.max(0, Math.round(n(cfg.mesesProjeto)));
  const projeto = r2(mesesProjeto * n(cfg.custoProjetoMes));

  const resultado = r2(preco - imp.total - externos - casa - projeto - financeiro);
  return {
    preco, meses, mesesProjeto, projeto,
    // quantos meses de fábrica a obra COME, contra os que o contrato dá
    mesesConsumo, ocupacaoPct: Math.round(ocupacao * 1000) / 10,
    // ⚠ folga positiva = fábrica sobrando no prazo; é venda a fazer, ou ociosidade a pagar
    folgaMeses: Math.round((meses - mesesConsumo) * 10) / 10,
    mesesContrato: mesesProjeto + meses,
    precoPorKg: n(res?.pesoTotal) > 0 ? r2(preco / n(res.pesoTotal)) : 0,
    impostos: imp.total, impostoDebito: imp.debito, impostoCredito: imp.credito,
    impostoFixo: imp.fixo, cargaMarginal: imp.cargaMarginal,
    material, externos, casa, financeiro, resultado,
    margemRealPct: preco > 0 ? r2((resultado / preco) * 100) : 0,
    margemPretendidaPct: r2(n(cen?.margemPct)),
    // quanto o R$/kg carrega de resultado — é assim que se compara obra com obra
    resultadoPorKg: n(res?.pesoTotal) > 0 ? r2(resultado / n(res.pesoTotal)) : 0,
  };
}

/**
 * Até onde dá para ceder.
 *
 * ⚠ É O NÚMERO QUE FALTA NUMA REUNIÃO. Ninguém negocia sabendo "a margem é 10%" — negocia
 * sabendo o preço em que a obra empata, e portanto quanto de desconto ainda cabe. Fechado:
 *
 *   preço − [impostoFixo + (preço − custoDireto)·c] − externos − casa − financeiro = 0
 *   preço* = (impostoFixo − c·custoDireto + externos + casa + financeiro) ÷ (1 − c)
 */
export function pontoDeEquilibrio(res, r) {
  const c = n(r?.cargaMarginal);
  if (c >= 1) return null;
  const custoDireto = n(res?.custoDireto);
  // ⚠ O PROJETO ENTRA AQUI. `resultadoDoCenario` subtrai o custo de projeto, mas a fórmula do
  // equilíbrio esquecia de devolvê-lo ao numerador — e o buraco era exatamente `projeto ÷ (1 − c)`.
  // Com 3 meses de projeto a R$ 250 mil, o portal dizia que a obra empatava R$ 800 mil abaixo do
  // preço em que ela de fato empata: autorizava um desconto que a obra não aguenta.
  const minimo = r2((n(r.impostoFixo) - c * custoDireto + n(r.externos) + n(r.casa) + n(r.projeto) + n(r.financeiro)) / (1 - c));
  const peso = n(res?.pesoTotal);
  return {
    preco: minimo,
    precoPorKg: peso > 0 ? r2(minimo / peso) : 0,
    descontoMaxPct: n(r.preco) > 0 ? r2(((n(r.preco) - minimo) / n(r.preco)) * 100) : 0,
    folga: r2(n(r.preco) - minimo),
    // ⚠ o preço do contrato não sobe quando o aço sobe: o prejuízo é o aumento inteiro. Por isso
    // aqui NÃO se acrescenta imposto sobre a diferença — o que se fatura continua o mesmo.
    acoPodeSubirPct: n(r.material) > 0 ? r2((n(r.resultado) / n(r.material)) * 100) : 0,
    mesesLimite: n(r.casa) > 0 && n(r.meses) > 0
      ? Math.round(((n(r.resultado) + n(r.casa)) / (n(r.casa) / n(r.meses))) * 10) / 10
      : 0,
  };
}

/**
 * O que move o resultado, em ordem.
 *
 * ⚠ SERVE PARA SABER ONDE GASTAR A NEGOCIAÇÃO. Numa obra em que o material é metade do custo,
 * discutir 10% do aço com o fornecedor vale mais do que discutir 1 ponto de margem com o cliente
 * — e o contrário também acontece. Sem esta ordem, a energia vai para o campo mais fácil de
 * mexer, que quase nunca é o que pesa.
 */
export function sensibilidade(calcular, alavancas) {
  const base = n(calcular({}));
  return alavancas
    .map((a) => {
      const novo = n(calcular(a.mods || {}));
      return { ...a, resultado: r2(novo), delta: r2(novo - base) };
    })
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
}

// ⚠ OS PASSOS SÃO O QUE ACONTECE DE VERDADE, não ±1% de tudo. Um desconto de 5% é o pedido de
// praxe; o aço mexe 10% num semestre; a fábrica render 10% menos é uma linha parada; e 30 dias a
// mais de recebimento é uma medição atrasada. Passo irreal produz ranking irreal.
export const ALAVANCAS_SENSIVEIS = [
  { key: "preco", nome: "Desconto no preço", passo: "−5%", mods: { precoPct: -5 } },
  { key: "aco", nome: "Aço mais caro", passo: "+10%", mods: { acoPct: 10 } },
  { key: "cadencia", nome: "Fábrica rende menos", passo: "−10%", mods: { cadenciaPct: -10 } },
  { key: "prazo", nome: "Obra atrasa", passo: "+2 meses", mods: { mesesExtra: 2 } },
  { key: "recebimento", nome: "Cliente paga mais tarde", passo: "+30 dias", mods: { recebimentoDias: 30 } },
];

/**
 * O preço de equilíbrio, convergido.
 *
 * ⚠ ELE MORDE A PRÓPRIA CAUDA. Baixar o preço atrasa o caixa, o que aumenta o juro do período, o
 * que sobe o preço de equilíbrio. Calcular uma vez só, com o custo do dinheiro do preço cheio,
 * dá um empate otimista — e otimismo em preço mínimo é o erro que fecha obra no prejuízo.
 * Poucas voltas bastam: o número para de andar quando muda menos de mil reais.
 */
export function equilibrioConvergido(res, base, recalcular, voltas = 4) {
  const zero = pontoDeEquilibrio(res, base);
  if (!zero) return null;
  let eq = zero;
  for (let i = 0; i < voltas; i++) {
    const pct = n(base?.preco) > 0 ? (eq.preco / n(base.preco) - 1) * 100 : 0;
    const proximo = pontoDeEquilibrio(res, recalcular({ precoPct: pct }));
    if (!proximo) break;
    const parou = Math.abs(proximo.preco - eq.preco) < 1000;
    eq = proximo;
    if (parou) break;
  }
  const preco = n(base?.preco);
  return {
    ...eq,
    // ⚠ desconto e folga se medem contra o PREÇO DA PROPOSTA, não contra o próprio equilíbrio
    descontoMaxPct: preco > 0 ? r2(((preco - eq.preco) / preco) * 100) : 0,
    folga: r2(preco - eq.preco),
    // ⚠ aço e prazo valem no preço da proposta — é nele que a obra vai ser feita
    acoPodeSubirPct: zero.acoPodeSubirPct,
    mesesLimite: zero.mesesLimite,
  };
}
