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
export const PERFIS = [
  { nome: "U/Ue dobrado", preco: 7.0 }, { nome: "Perfil soldado", preco: 10.5 },
  { nome: "U laminado", preco: 8.0 }, { nome: "Ferro chato", preco: 6.5 },
  { nome: "Barra Quadrada", preco: 7.2 }, { nome: "Barra Roscada", preco: 18.0 },
  { nome: "Chapa Lisa", preco: 6.5 }, { nome: "Chapa Expandida", preco: 10.5 },
  { nome: "Chapa Xadrez", preco: 7.5 }, { nome: "Ferro redondo", preco: 6.5 },
  { nome: "W laminado", preco: 7.6 }, { nome: "L laminado", preco: 6.5 },
  { nome: "Tubo", preco: 7.3 },
];

// ⚠ FATURAMENTO manda no IMPOSTO, não só no texto. Na planilha, ICMS e PIS/COFINS só entram na
// linha quando o faturamento é TORG (`=IF($D$5="TORG"; …)`): material que o cliente compra
// direto do fornecedor não passa pelo nosso faturamento e não carrega nosso imposto.
export const FATURAMENTO = ["TORG", "DIRETO", "N/A"];
export const ESTRUTURAS = ["COBERTURA", "FECHAMENTO", "ESCADA", "ESCADA MARINHEIRO", "PLATAFORMA", "GUARDA CORPO", "SUPORTES", "ESTRUTURA AUXILIAR"];
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
  { key: "ITENS_COMERCIAIS", nome: "Material — itens comerciais", padrao: "6101" },
  { key: "MATERIAL_IND", nome: "Material para industrialização", padrao: "6101" },
  { key: "PROJETO", nome: "Projeto (5% do fat. Torg)", padrao: "702" },
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
  { key: "TELHA_TERMO", nome: "TELHA TERMOACÚSTICA - 0,50 x 0,43 - PIR 30mm", un: "m²", preco: 125 },
  { key: "TELHA_SIMPLES", nome: "TELHA SIMPLES TP 40 - 0,65mm", un: "m²", preco: 0 },
  { key: "CALHAS", nome: "CALHAS", un: "m", preco: 120 },
  { key: "RUFOS", nome: "RUFOS", un: "m", preco: 40 },
  { key: "LANTERNIM", nome: "LANTERNIM", un: "m", preco: 0 },
  { key: "VENEZIANAS", nome: "VENEZIANAS", un: "m²", preco: 0 },
  { key: "CHUMBADORES", nome: "CHUMBADORES QUÍMICOS", un: "unid.", preco: 0 },
  { key: "STEEL_DECK", nome: "STEEL DECK", un: "m²", preco: 0 },
  { key: "LINHA_VIDA", nome: "LINHA DE VIDA", un: "m", preco: 0 },
  { key: "GRADE_PISO", nome: "GRADES DE PISO", un: "m²", preco: 0 },
];

// Mão de obra terceirizada (aba INDUSTRIALIZAÇÃO, item 2). Preço em R$/kg sobre o peso total.
export const TERCEIRIZADOS = [
  { key: "CALCULO", nome: "Cálculo Estrutural, memorial e ART" },
  { key: "GALVANIZACAO", nome: "Galvanização a fogo" },
  { key: "GALV_FRETE", nome: "Frete (galvanização)", comIcms: true },
  { key: "QUALIDADE", nome: "Inspeção e Data Book" },
  { key: "FRETE", nome: "Transporte até a Obra", comIcms: true },
];

const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
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
  let pesoTotal = 0;
  for (const l of resumos) {
    const kg = n(l.pesoTotal ?? n(l.quantidade) * n(l.unidades || 1) * n(l.pesoUnit));
    pesoTotal += kg;
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
      nome, espec, pesoKg: r2(kg), precoKg: n(precoKg), subtotal,
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
  const materiaPrima = PERFIS.map((p) => linha(p.nome, pesoPorPerfil[p.nome] || 0, precoPerfil[p.nome], fat.materiaPrima));
  const fixadores = [linha("Parafusos A325 e A307", pesoTotal, c.fixadoresRsKg, fat.fixadores)];
  const tintas = (c.tintas || []).map((t) => linha(t.nome || "ESTRUTURA", n(t.pesoKg), n(t.precoKg), fat.tintas, "material", t.perda ? `${t.perda}%` : null));

  // ── 2. MÃO DE OBRA TERCEIRIZADA ──
  const terceirizados = TERCEIRIZADOS.map((t) => {
    const cfg = c.terceirizados?.[t.key] || {};
    const l = linha(t.nome, pesoTotal, cfg.precoKg, fat[t.key] || fat.terceirizados, "servico");
    // frete carrega ICMS 12% como na planilha, mesmo sendo serviço
    if (t.comIcms) { l.icmsPct = 0.12; l.icms = String(fat[t.key] || fat.terceirizados || "").toUpperCase() === "TORG" ? r2(l.subtotal * 0.12) : 0; }
    return l;
  });

  // ── 3. INDUSTRIALIZAÇÃO (fabricação, pintura, pré-montagem) ──
  const iDemaos = Math.max(0, Math.min(2, (Number(String(c.demaos || "").replace(/\D/g, "")) || 1) - 1));
  const chavePre = c.preMontagem === "PRÉ-MONT. 100%" ? "preMont100" : c.preMontagem === "PRÉ-MONT. 10%" ? "preMont10" : null;
  const porClasse = (campo) => CLASSES.map((cl) => {
    const kg = pesoPorClasse[cl.nome.toUpperCase()] || 0;
    const preco = c.precos?.classe?.[cl.key]?.[campo]
      ?? (campo === "fabricacao" ? cl.fabricacao : campo === "pintura" ? cl.demaos[iDemaos] : chavePre ? cl[chavePre] : 0);
    return { cl, kg, preco: n(preco) };
  });
  const fabricacao = porClasse("fabricacao").map((x) => linha(x.cl.nome, x.kg, x.preco, fat.fabricacao, "material", x.cl.faixa));
  const pintura = porClasse("pintura").map((x) => linha(x.cl.nome, x.kg, x.preco, fat.pintura, "material", `Nº DEMÃOS - ${iDemaos + 1}`));
  const preMontagem = porClasse("preMont").map((x) => linha(x.cl.nome, x.kg, x.preco, fat.preMontagem, "material", chavePre ? c.preMontagem : "N/A"));

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
  const mapa = [
    ["materiaPrima", grupos.materiaPrima], ["fixadores", grupos.fixadores], ["tintas", grupos.tintas],
    ["fabricacao", grupos.fabricacao], ["pintura", grupos.pintura], ["preMontagem", grupos.preMontagem],
  ];
  let custoTorg = 0, custoDireto = 0, custoOutro = 0;
  for (const [k, g] of mapa) {
    const v = porFaturamento(g);
    if (ehTorg(k)) custoTorg += v; else if (ehDireto(k)) custoDireto += v; else custoOutro += v;
  }
  for (const t of TERCEIRIZADOS) {
    const l = grupos.terceirizados.linhas.find((x) => x.nome === t.nome);
    const v = l?.subtotal || 0;
    if (ehTorg(t.key)) custoTorg += v; else if (ehDireto(t.key)) custoDireto += v; else custoOutro += v;
  }
  // itens comerciais seguem o faturamento próprio; sem escolha, ficam com a Torg
  if (ehDireto("itensComerciais")) custoDireto += totalComerciais; else custoTorg += totalComerciais;

  // ⚠ o que ficou "N/A" é custo nosso do mesmo jeito — entra no lado TORG, senão soma no custo e
  // some do preço, e a obra nasce com prejuízo embutido.
  custoTorg = r2(custoTorg + custoOutro);
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
    grupos, totais: { material, mdo, industrializacao, comerciais: totalComerciais },
    custo, custoTorg, custoDireto,
    bdiPct: r2(bdi * 100), bdiValor, preco,
    impostos, totalImpostos,
    precoPorKg: pesoTotal > 0 ? r2(preco / pesoTotal) : 0,
  };
}

// ─── CENÁRIO FINANCEIRO ───────────────────────────────────────────────────────
// Vitor (22/08/2026): "criar uma aba nova como cenário financeiro, principalmente se for material
// por nossa conta".
//
// ⚠ É AQUI QUE O ORÇAMENTO GANHA OU PERDE DINHEIRO DEPOIS DE FECHADO. Quando o material é por
// nossa conta, a Torg compra o aço no começo e recebe ao longo da obra: entre um e outro há meses
// em que o nosso caixa está financiando o cliente. Uma proposta pode ter margem boa no papel e
// ainda assim ser ruim, se o pico de exposição for grande demais ou se o custo do dinheiro comer
// o BDI. Material DIRETO (o cliente compra do fornecedor) muda tudo — e é exatamente a diferença
// que esta aba mostra.
//
// A conta é de fluxo, não de índice: desembolso quando se paga, recebimento quando se recebe,
// saldo acumulado mês a mês. O pico negativo é a necessidade de capital de giro.

const MES = (d) => Math.max(0, Math.round(n(d) / 30));

/**
 * @param {object} res saída de calcularLqc
 * @param {object} cfg { prazoFabricacaoMeses, pagamentoFornecedorDias, compraNoMes,
 *                       parcelas:[{pct, dias}], taxaMensalPct }
 */
export function cenarioFinanceiro(res, cfg = {}) {
  const meses = Math.max(1, Math.round(n(cfg.prazoFabricacaoMeses) || 3));
  const taxa = n(cfg.taxaMensalPct) / 100;
  const horizonte = meses + 6;

  const saidas = new Array(horizonte + 1).fill(0);
  const entradas = new Array(horizonte + 1).fill(0);

  // Material: comprado no início (mês `compraNoMes`, padrão 0) e pago no prazo do fornecedor.
  const mesPagaMaterial = Math.min(horizonte, MES(cfg.compraNoMes ? cfg.compraNoMes * 30 : 0) + MES(cfg.pagamentoFornecedorDias));
  saidas[mesPagaMaterial] += n(res?.totais?.material?.subtotal) + n(res?.totais?.comerciais);

  // Industrialização e terceirizados: acompanham a produção, diluídos no prazo de fabricação.
  const porMes = (n(res?.totais?.industrializacao?.subtotal) + n(res?.totais?.mdo?.subtotal)) / meses;
  for (let m = 1; m <= meses; m++) saidas[Math.min(horizonte, m)] += porMes;

  // Recebimento: as parcelas da proposta. Sem parcela definida, assume à vista no fim da obra —
  // o cenário mais conservador, que é o que serve pra decidir.
  const parcelas = Array.isArray(cfg.parcelas) && cfg.parcelas.length
    ? cfg.parcelas
    : [{ pct: 100, dias: meses * 30 }];
  for (const p of parcelas) entradas[Math.min(horizonte, MES(p.dias))] += n(res?.preco) * (n(p.pct) / 100);

  const fluxo = [];
  let saldo = 0, pico = 0, custoFinanceiro = 0;
  for (let m = 0; m <= horizonte; m++) {
    // juros sobre o saldo devedor do mês anterior — o dinheiro parado custa
    const juros = saldo < 0 ? r2(-saldo * taxa) : 0;
    custoFinanceiro = r2(custoFinanceiro + juros);
    saldo = r2(saldo - juros + entradas[m] - saidas[m]);
    if (saldo < pico) pico = saldo;
    fluxo.push({ mes: m, saida: r2(saidas[m]), entrada: r2(entradas[m]), juros, saldo });
  }

  const margem = r2(n(res?.preco) - n(res?.custo));
  return {
    meses, fluxo,
    capitalDeGiro: r2(-pico),           // quanto a Torg precisa ter em caixa no pior mês
    custoFinanceiro,
    margemBruta: margem,
    margemLiquida: r2(margem - custoFinanceiro),
    margemLiquidaPct: n(res?.preco) > 0 ? r2(((margem - custoFinanceiro) / n(res.preco)) * 100) : 0,
    // ⚠ o alerta que justifica a aba: material por nossa conta com recebimento no fim.
    materialPorNossaConta: n(res?.totais?.material?.subtotal) > 0,
  };
}
