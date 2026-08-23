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
export const ITENS_COMERCIAIS = [
  { key: "TELHA_TERMO", nome: "TELHA TERMOACÚSTICA - 0,50 x 0,43 - PIR 30mm", rotulo: "Telha termoacústica 0,50 × 0,43 — PIR 30 mm", un: "m²", preco: 125 },
  { key: "TELHA_SIMPLES", nome: "TELHA SIMPLES TP 40 - 0,65mm", rotulo: "Telha simples TP 40 — 0,65 mm", un: "m²", preco: 0 },
  { key: "CALHAS", nome: "CALHAS", rotulo: "Calhas", un: "m", preco: 120 },
  { key: "RUFOS", nome: "RUFOS", rotulo: "Rufos", un: "m", preco: 40 },
  { key: "LANTERNIM", nome: "LANTERNIM", rotulo: "Lanternim", un: "m", preco: 0 },
  { key: "VENEZIANAS", nome: "VENEZIANAS", rotulo: "Venezianas", un: "m²", preco: 0 },
  { key: "CHUMBADORES", nome: "CHUMBADORES QUÍMICOS", rotulo: "Chumbadores químicos", un: "un", preco: 0 },
  { key: "STEEL_DECK", nome: "STEEL DECK", rotulo: "Steel deck", un: "m²", preco: 0 },
  { key: "LINHA_VIDA", nome: "LINHA DE VIDA", rotulo: "Linha de vida", un: "m", preco: 0 },
  { key: "GRADE_PISO", nome: "GRADES DE PISO", rotulo: "Grades de piso", un: "m²", preco: 0 },
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
  { chave: "FRETE", descricao: "Transporte até a obra", base: "kg", comIcms: true },
];
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

export function perdaDaEstrutura(estrutura) {
  const e = String(estrutura || "").toLowerCase();
  return e.includes("guarda corpo") || e.includes("escada marinheiro") ? 85 : 45;
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
  const resumos = Array.isArray(c.resumos) ? c.resumos : [];
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

  const camadasDe = (perda) => (c.tintas || []).filter((t) => Number(t?.perda ?? 45) === perda);
  const tintas = [45, 85].map((perda) => {
    const camadas = camadasDe(perda).map((t) => {
      const areaCamada = n(t.areaM2) > 0 ? n(t.areaM2) : (areaPorPerda[perda] || 0);
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

  // peso de cada área, para o terceiro que se cobra só de um trecho
  const pesoPorArea = {};
  for (const l of resumos) {
    const kg = n(l.pesoTotal ?? n(l.quantidade) * n(l.unidades || 1) * n(l.pesoUnit));
    if (l.area) pesoPorArea[l.area] = (pesoPorArea[l.area] || 0) + kg;
  }

  const terceirizados = listaTerceiros.map((t) => {
    const base = t.base || "kg";
    // ⚠ terceiro pode valer só para UMA área (na LQC real, cálculo estrutural é assim: um preço
    // por trecho, com descrição própria). Sem área, vale a obra inteira.
    const pesoBase = t.area ? (pesoPorArea[t.area] || 0) : pesoTotal;
    const qtd = base === "kg" ? pesoBase : base === "m2" ? areaM2 : (n(t.quantidade) || 1);
    const sug = TERCEIROS_SUGESTOES.find((x) => x.chave === t.chave);
    const l = linha(t.descricao || sug?.descricao || "Terceiro", qtd, t.precoUnit, t.faturamento, "servico", t.area || BASES_TERCEIRO[base]);
    l.chave = t.chave || null;
    l.area = t.area || null;
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
  // percentual livre de pré-montagem; sem percentual, cai no rótulo antigo (10% / 100%)
  const pctPre = c.preMontagemPct != null && c.preMontagemPct !== ""
    ? n(c.preMontagemPct)
    : (c.preMontagem === "PRÉ-MONT. 100%" ? 100 : c.preMontagem === "PRÉ-MONT. 10%" ? 10 : 0);
  const porClasse = (campo) => CLASSES.map((cl) => {
    const kg = pesoPorClasse[cl.nome.toUpperCase()] || 0;
    const preco = c.precos?.classe?.[cl.key]?.[campo]
      ?? (campo === "fabricacao" ? cl.fabricacao : campo === "pintura" ? precoPintura(cl) : precoPreMontagem(cl, pctPre));
    return { cl, kg, preco: n(preco) };
  });
  const fabricacao = porClasse("fabricacao").map((x) => linha(x.cl.nome, x.kg, x.preco, "TORG", "material", x.cl.faixa));
  const pintura = porClasse("pintura").map((x) => linha(x.cl.nome, x.kg, x.preco, "TORG", "material", `${nDemaos} ${nDemaos === 1 ? "demão" : "demãos"}`));
  const preMontagem = porClasse("preMont").map((x) => linha(x.cl.nome, x.kg, x.preco, "TORG", "material", pctPre > 0 ? `${pctPre}% pré-montado` : "N/A"));

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

  // ── ENSAIOS DA QUALIDADE ──
  // ⚠ entram no custo pelo VALOR FECHADO, não por R$/kg: ensaio se cobra por ensaio feito. O
  // R$/kg aparece só como leitura, e é ele que a linha 2.3 da LQC (Inspeção e Data Book) recebe.
  const ensaios = calcularEnsaios(c.ensaios || {}, pesoTotal, areaM2);
  ensaios.porKg = pesoTotal > 0 ? Math.round((ensaios.total / pesoTotal) * 10000) / 10000 : 0;

  // ── ITENS COMERCIAIS ──
  const comerciais = ITENS_COMERCIAIS.map((i) => {
    const cfg = c.itensComerciais?.[i.key] || {};
    const qtd = n(cfg.qtd), preco = cfg.preco == null ? i.preco : n(cfg.preco);
    return { ...i, qtd, preco, subtotal: r2(qtd * preco) };
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

  // ⚠ o que ficou "N/A" é custo nosso do mesmo jeito — entra no lado TORG, senão soma no custo e
  // some do preço, e a obra nasce com prejuízo embutido.
  custoTorg = r2(custoTorg + custoOutro + custoTorgServico);
  custoDireto = r2(custoDireto);

  const custo = r2(custoTorg + custoDireto);
  const bdiValor = r2(custoTorg * bdi);
  const preco = r2(custoTorg + bdiValor + custoDireto);

  // ── impostos por linha de faturamento (quadro VALORES DE FATURAMENTO) ──
  const cfops = c.cfops || {};
  const baseFaturamento = {
    ITENS_COMERCIAIS: totalComerciais,
    MATERIAL_IND: porFaturamento(grupos.materiaPrima) + porFaturamento(grupos.fixadores) + porFaturamento(grupos.tintas),
    PROJETO: r2((custoTorg + bdiValor) * 0.05),
    INDUSTRIALIZACAO: r2(custoTorg + bdiValor - (custoTorg + bdiValor) * 0.05),
    MONTAGEM: n(c.montagem?.total),
    EQUIPAMENTOS: n(c.montagem?.equipamentos),
  };
  const impostos = LINHAS_FATURAMENTO.map((l) => {
    const cod = cfops[l.key] || l.padrao;
    const base = r2(baseFaturamento[l.key] || 0);
    const carga = cargaDoCfop(cod);
    return { ...l, cfop: cod, base, cargaPct: r2(carga * 100), valor: r2(base * carga) };
  });
  const totalImpostos = r2(impostos.reduce((a, i) => a + i.valor, 0));

  return {
    pesoTotal: r2(pesoTotal), pesoPorClasse, pesoPorPerfil,
    grupos, totais: { material, mdo, industrializacao, comerciais: totalComerciais, ensaios: ensaios.total },
    areaM2: r2(areaM2), ensaios, preMontagemPct: pctPre,
    custo, custoTorg, custoDireto,
    bdiPct: r2(bdi * 100), bdiValor, preco,
    impostos, totalImpostos, demaos: nDemaos, bdiCampos: c.bdi || {},
    // ⚠ o que SAI da empresa (material, terceiros, itens comerciais) — a industrialização não
    // entra: ela é a nossa fábrica, já paga pelo custo mensal da casa.
    custosExternos: r2(material.subtotal + mdo.subtotal + totalComerciais),
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
      precoPorKg: 0,
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
// vezes, e foi o erro da primeira versão desta conta. Conferido na configuração de custo-hora:
// o `custoTotalMensal` de R$ 784.270 é a folha dos 8 setores com encargos (R$ 408.520) MAIS todos
// os outros custos (R$ 375.750). É a casa inteira, por mês. A "industrialização" que o estudo
// cobra (fabricação + pintura + pré-montagem) é justamente a mão de obra dessa casa: cobrar as
// duas no mesmo custo é pagar a fábrica duas vezes.
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
  const meses = Math.max(1, Math.ceil(n(dados.meses) || 1));
  const taxa = n(cfg.taxaMensalPct) / 100;
  const horizonte = meses + 2;

  const entradaPct = n(cfg.entradaPct) / 100;
  const entregaPct = n(cfg.entregaPct) / 100;
  const medicaoPct = Math.max(0, 1 - entradaPct - entregaPct);

  // material: compra concentrada no começo (a fábrica não corta o que não chegou)
  const mesesCompra = Math.max(1, Math.min(meses, Math.round(n(cfg.mesesCompraMaterial) || Math.ceil(meses * 0.3))));
  const atrasoPagto = Math.max(0, Math.round(n(cfg.prazoFornecedorDias) / 30));

  const saidas = new Array(horizonte + 1).fill(0);
  const entradas = new Array(horizonte + 1).fill(0);

  const material = n(dados.material);
  for (let m = 1; m <= mesesCompra; m++) {
    const quando = Math.min(horizonte, m + atrasoPagto);
    saidas[quando] += material / mesesCompra;
  }
  const porMes = (n(dados.terceiros) + n(dados.custoOperacionalMes) * meses) / meses;
  for (let m = 1; m <= meses; m++) saidas[Math.min(horizonte, m)] += porMes;

  const preco = n(dados.preco);
  entradas[0] += preco * entradaPct;
  for (let m = 1; m <= meses; m++) entradas[Math.min(horizonte, m)] += (preco * medicaoPct) / meses;
  entradas[Math.min(horizonte, meses)] += preco * entregaPct;

  // imposto sai no mês em que se fatura, sobre o que foi faturado
  const aliqImposto = preco > 0 ? n(dados.impostos) / preco : 0;
  for (let m = 0; m <= horizonte; m++) saidas[m] += entradas[m] * aliqImposto;

  const fluxo = [];
  let saldo = 0, pico = 0, juros = 0;
  for (let m = 0; m <= horizonte; m++) {
    const j = saldo < 0 ? -saldo * taxa : 0;
    juros += j;
    saldo = saldo - j + entradas[m] - saidas[m];
    if (saldo < pico) pico = saldo;
    fluxo.push({ mes: m, entrada: r2(entradas[m]), saida: r2(saidas[m]), juros: r2(j), saldo: r2(saldo) });
  }

  const reservado = n(dados.reservaFinanceira);
  return {
    meses, fluxo,
    capitalDeGiro: r2(-pico),
    custoFinanceiro: r2(juros),
    reservadoNoBdi: r2(reservado),
    // ⚠ o que o BDI reservou menos o que o dinheiro custou. Negativo = está saindo do lucro.
    diferenca: r2(reservado - juros),
    resultadoFinal: r2(saldo),
  };
}

