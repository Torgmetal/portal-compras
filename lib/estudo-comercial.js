import "server-only";

// LEITURA DA PLANILHA DE ESTUDO DO COMERCIAL (EPC-nnn-aa-Rx-CLIENTE-OBRA.xlsx/.xlsm).
//
// Vitor (19/08/2026): "na proposta temos as descrições dos trabalhos, verbas etc; porém no estudo,
// lá sim terá a memória de cálculo de tudo — verbas estimadas, área de pintura estimada, área de
// telha etc. Preciso que leia essa planilha e preencha as informações pelas famílias que ele
// definiu nas planilhas, para podermos ter o andamento das coisas".
//
// Onde mora: `Comercial/1. Orçamento/ORÇAMENTOS_<ano>/2. Concluidos/<nnn-aa-CLIENTE-OBRA>/5.Estudos`.
// A pasta do orçamento tem sempre 1.Emails, 2.Projetos, 3.Documentos, 4.Cotações, 5.Estudos,
// 6.Propostas, 7.Confidencialidade — a proposta técnica/comercial sai de 6.Propostas.
//
// 🚨 **DOIS MODELOS DE PLANILHA.** O Comercial trocou o modelo em 2026 e os dois convivem na
// pasta — o leitor entende os dois (Vitor, 19/08: "somente a planilha agora mudou, é uma outra"):
//
//   ANTIGO `EPC-nnn-aa-Rx-CLIENTE-OBRA`  → BDM · BDI · CUSTOS · PESO PROJETO · PINTURA · RESUMO ·
//                                          CALHAS E RUFOS
//   NOVO   `LQC-nnn-aa-CLIENTE-OBRA-Rxx` → PARÂMETROS · BDM · PLANILHA COMERCIAL · BDI ·
//                                          INDUSTRIALIZAÇÃO · ITENS COMERCIAIS ·
//                                          QTDS ITENS COMERCIAIS · MONTAGEM · MC_TINTAS ·
//                                          RESUMOS_EM · PESO PROJETO
//
// O que mudou de nome: PINTURA→**MC_TINTAS**, RESUMO→**RESUMOS_EM**, CUSTOS→INDUSTRIALIZAÇÃO.
// O que nasceu: **ITENS COMERCIAIS** e **QTDS ITENS COMERCIAIS** — são as "famílias que ele
// definiu na planilha" (telha, calhas, rufos), com quantidade POR ÁREA. É o que faltava pra
// acompanhar suprimentos por área.
//
// ⚠️ No modelo novo o **RESUMOS_EM** é a fonte do peso, não o PESO PROJETO: quando o método é
// ESTIMATIVA, a aba PESO PROJETO vem com 3.372 linhas zeradas (é o detalhamento, que só é
// preenchido no método PESO DE PROJETO).
//
// ⚠️ O nome da aba varia ("PESO PROJETO (2)"), então o casamento é por PREFIXO normalizado, nunca
// por igualdade. E as colunas são localizadas pelo CABEÇALHO, não por posição fixa: a linha de
// cabeçalho muda de altura entre estudos.
//
// 🚫 Nada é inventado: quando a aba não existe ou o cabeçalho não é reconhecido, o campo volta
// `null` e o import mostra o que não conseguiu ler. Estudo é base de compra — chute aqui vira
// material errado comprado.

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
const num = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v ?? "").replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
};

/** Acha a aba cujo nome começa com o prefixo (normalizado). */
function acharAba(wb, prefixo) {
  const p = norm(prefixo);
  const nome = wb.SheetNames.find((n) => norm(n) === p) || wb.SheetNames.find((n) => norm(n).startsWith(p));
  return nome ? { nome, ws: wb.Sheets[nome] } : null;
}

/** Linha de cabeçalho = a primeira que contém TODOS os rótulos pedidos. */
function acharCabecalho(linhas, rotulos, ate = 15) {
  for (let i = 0; i < Math.min(linhas.length, ate); i++) {
    const cel = (linhas[i] || []).map(norm);
    if (rotulos.every((r) => cel.some((c) => c.includes(norm(r))))) {
      const idx = {};
      for (const r of rotulos) idx[r] = cel.findIndex((c) => c.includes(norm(r)));
      return { i, idx, cel };
    }
  }
  return null;
}

/**
 * PESO PROJETO — a memória de cálculo do aço. É a aba mais importante: dela saem o peso da obra,
 * a área de pintura e o número de barras.
 */
function lerPesoProjeto(XLSX, wb) {
  const aba = acharAba(wb, "PESO PROJETO");
  if (!aba) return null;
  const linhas = XLSX.utils.sheet_to_json(aba.ws, { header: 1, blankrows: false, defval: null });
  const cab = acharCabecalho(linhas, ["material", "peso total"]);
  if (!cab) return { aba: aba.nome, erro: "cabeçalho de PESO PROJETO não reconhecido" };

  const col = (r) => cab.cel.findIndex((c) => c.includes(norm(r)));
  const cMat = cab.idx["material"], cPeso = cab.idx["peso total"];
  const cArea = col("area de pintura"), cBarras = col("barras"), cQtd = col("qtd"), cDez = col("10%");

  const perfis = [];
  for (let i = cab.i + 1; i < linhas.length; i++) {
    const l = linhas[i] || [];
    const mat = String(l[cMat] ?? "").trim();
    if (!mat) continue;
    // a aba termina em "NOTAS:" e vira tabela dinâmica ("Rótulos de Linha" / "Total Geral")
    if (/^(notas|rotulos|total geral|soma de)/i.test(norm(mat))) break;
    const peso = num(l[cPeso]);
    if (!(peso > 0)) continue;
    perfis.push({
      material: mat,
      qtd: cQtd >= 0 ? num(l[cQtd]) : null,
      pesoKg: peso,
      pesoComPerdaKg: cDez >= 0 ? num(l[cDez]) : null,
      areaPinturaM2: cArea >= 0 ? num(l[cArea]) : null,
      barras6m: cBarras >= 0 ? num(l[cBarras]) : null,
    });
  }
  const soma = (k) => perfis.reduce((a, p) => a + (p[k] || 0), 0) || null;
  return {
    aba: aba.nome,
    perfis,
    pesoKg: soma("pesoKg"),
    pesoComPerdaKg: soma("pesoComPerdaKg"),
    areaPinturaM2: soma("areaPinturaM2"),
    barras6m: soma("barras6m"),
  };
}

/** PINTURA — litros de tinta e diluente pra área estimada. */
function lerPintura(XLSX, wb) {
  const aba = acharAba(wb, "PINTURA");
  if (!aba) return null;
  const linhas = XLSX.utils.sheet_to_json(aba.ws, { header: 1, blankrows: false, defval: null });
  const itens = [];
  for (const l of linhas) {
    const cels = (l || []).map((v) => String(v ?? "").trim());
    // ⚠ "tinta" e "qtd (l)" sozinhos são CABEÇALHO da tabela, não produto — entravam como item
    const ehCabecalho = (c) => /^(tinta|produto|qtd|item|descricao)\s*(\(l\))?$/i.test(norm(c));
    const iNome = cels.findIndex((c) => /^(fundo|tinta|diluente|esmalte|primer|acabamento)\b/i.test(norm(c)) && !ehCabecalho(c));
    if (iNome < 0) continue;
    // o litro é o primeiro número à direita do nome
    const litros = (l || []).slice(iNome + 1).map(num).find((n) => n && n > 0) || null;
    if (!litros) continue;
    itens.push({ produto: cels[iNome], litros: Math.round(litros * 100) / 100 });
  }
  return { aba: aba.nome, itens: itens.slice(0, 12) };
}

/** RESUMO — áreas por prédio/elemento; é onde aparece a telha (m²). */
function lerCobertura(XLSX, wb) {
  const aba = acharAba(wb, "RESUMO");
  if (!aba) return null;
  const linhas = XLSX.utils.sheet_to_json(aba.ws, { header: 1, blankrows: false, defval: null });
  const cab = acharCabecalho(linhas, ["cobertura", "area"]);
  if (!cab) return { aba: aba.nome, erro: "cabeçalho de RESUMO não reconhecido" };
  const cCob = cab.idx["cobertura"], cArea = cab.idx["area"];
  const porTipo = new Map();
  for (let i = cab.i + 1; i < linhas.length; i++) {
    const l = linhas[i] || [];
    const tipo = String(l[cCob] ?? "").trim();
    const area = num(l[cArea]);
    if (!tipo || !(area > 0)) continue;
    if (/^total/i.test(norm(tipo))) continue;
    porTipo.set(tipo, (porTipo.get(tipo) || 0) + area);
  }
  const itens = [...porTipo.entries()].map(([tipo, m2]) => ({ tipo, areaM2: Math.round(m2 * 100) / 100 }));
  return { aba: aba.nome, itens, areaTotalM2: itens.reduce((a, x) => a + x.areaM2, 0) || null };
}

/** CALHAS E RUFOS — quantidades da cobertura complementar. */
function lerCalhasRufos(XLSX, wb) {
  const aba = acharAba(wb, "CALHAS E RUFOS");
  if (!aba) return null;
  const linhas = XLSX.utils.sheet_to_json(aba.ws, { header: 1, blankrows: false, defval: null });
  const iTotal = linhas.findIndex((l) => (l || []).some((c) => /^total/i.test(norm(String(c ?? "")))));
  if (iTotal < 0) return { aba: aba.nome, itens: [] };
  // o cabeçalho dos tipos é a linha com "CALHAS"/"RUFOS" e a seguinte com os nomes
  const iTipos = linhas.findIndex((l) => (l || []).some((c) => /pingadeira|chapeu|cumeeira|lateral/i.test(norm(String(c ?? "")))));
  const tipos = iTipos >= 0 ? (linhas[iTipos] || []).map((c) => String(c ?? "").trim()) : [];
  const total = linhas[iTotal] || [];
  const itens = [];
  for (let c = 0; c < total.length; c++) {
    const v = num(total[c]);
    if (v && v > 0 && tipos[c]) itens.push({ tipo: tipos[c], qtd: Math.round(v * 100) / 100 });
  }
  return { aba: aba.nome, itens };
}

/** RESUMOS_EM (modelo novo) — quantitativo por ÁREA: peso e área de pintura. */
function lerResumosEm(XLSX, wb) {
  const aba = acharAba(wb, "RESUMOS_EM");
  if (!aba) return null;
  const linhas = XLSX.utils.sheet_to_json(aba.ws, { header: 1, blankrows: false, defval: null });
  const cab = acharCabecalho(linhas, ["area", "quantidade"]);
  if (!cab) return { aba: aba.nome, erro: "cabeçalho de RESUMOS_EM não reconhecido" };
  const col = (r) => cab.cel.findIndex((c) => c.includes(norm(r)));
  const cArea = cab.idx["area"], cEstr = col("estrutura"), cUni = col("uni"), cQtd = cab.idx["quantidade"],
        cClas = col("classificacao"), cPeso = col("peso t"), cPint = col("area de p");
  const itens = [];
  for (let i = cab.i + 1; i < linhas.length; i++) {
    const l = linhas[i] || [];
    const area = String(l[cArea] ?? "").trim();
    if (!area || /^(total|-)$/i.test(norm(area))) continue;
    const peso = cPeso >= 0 ? num(l[cPeso]) : null;
    const qtd = num(l[cQtd]);
    if (!(peso > 0) && !(qtd > 0)) continue;
    itens.push({
      area, estrutura: cEstr >= 0 ? String(l[cEstr] ?? "").trim() || null : null,
      classificacao: cClas >= 0 ? String(l[cClas] ?? "").trim() || null : null,
      unidade: cUni >= 0 ? String(l[cUni] ?? "").trim() || null : null,
      quantidade: qtd, pesoKg: peso, areaPinturaM2: cPint >= 0 ? num(l[cPint]) : null,
    });
  }
  const soma = (k) => itens.reduce((a, x) => a + (x[k] || 0), 0) || null;
  return { aba: aba.nome, itens, pesoKg: soma("pesoKg"), areaPinturaM2: soma("areaPinturaM2") };
}

/** MC_TINTAS (modelo novo) — memória de cálculo das tintas. */
function lerMcTintas(XLSX, wb) {
  const aba = acharAba(wb, "MC_TINTAS");
  if (!aba) return null;
  const linhas = XLSX.utils.sheet_to_json(aba.ws, { header: 1, blankrows: false, defval: null });
  const cab = acharCabecalho(linhas, ["produto", "area de"]);
  if (!cab) return { aba: aba.nome, erro: "cabeçalho de MC_TINTAS não reconhecido" };
  const col = (r) => cab.cel.findIndex((c) => c.includes(norm(r)));
  const cProd = cab.idx["produto"], cCamada = col("camada"), cArea = cab.idx["area de"], cQtd = col("qtd. tinta");
  const itens = [];
  for (let i = cab.i + 1; i < linhas.length; i++) {
    const l = linhas[i] || [];
    const prod = String(l[cProd] ?? "").trim();
    if (!prod || /^(n\/a|total|-)$/i.test(norm(prod))) continue;
    const litros = cQtd >= 0 ? num(l[cQtd]) : null;
    if (!(litros > 0)) continue;
    itens.push({ produto: prod, camada: cCamada >= 0 ? String(l[cCamada] ?? "").trim() || null : null,
      areaM2: cArea >= 0 ? num(l[cArea]) : null, litros: Math.round(litros * 100) / 100 });
  }
  return { aba: aba.nome, itens };
}

/** QTDS ITENS COMERCIAIS (modelo novo) — as FAMÍLIAS do orçamento, com quantidade por ÁREA. */
function lerItensComerciais(XLSX, wb) {
  const aba = acharAba(wb, "QTDS ITENS COMERCIAIS");
  if (!aba) return null;
  const linhas = XLSX.utils.sheet_to_json(aba.ws, { header: 1, blankrows: false, defval: null });
  // duas linhas de cabeçalho: a de cima traz as UNIDADES (m², m), a de baixo os NOMES
  const iNomes = linhas.findIndex((l) => (l || []).some((c) => /^area$/i.test(norm(String(c ?? "")))));
  if (iNomes < 0) return { aba: aba.nome, erro: "cabeçalho de QTDS ITENS COMERCIAIS não reconhecido" };
  const nomes = (linhas[iNomes] || []).map((c) => String(c ?? "").trim());
  const unids = (linhas[iNomes - 1] || []).map((c) => String(c ?? "").trim());
  const familias = [];
  for (let c = 0; c < nomes.length; c++) {
    const n = nomes[c];
    if (!n || /^(area|estrutura|total)$/i.test(norm(n))) continue;
    familias.push({ col: c, nome: n, unidade: unids[c] || null, total: 0, porArea: [] });
  }
  // ⚠ PARA NA LINHA "Total". Logo abaixo dela vem OUTRA tabela, sem relação — o memorial da
  // telha (TELHAS | MED. A | MED. B | M²). Sem esse corte, "17.8" (uma medida em metros) entrava
  // como se fosse o nome de uma área.
  for (let i = iNomes + 1; i < linhas.length; i++) {
    const l = linhas[i] || [];
    const ehTotal = /^total$/i.test(norm(String(l[0] ?? "")));
    for (const f of familias) {
      const v = num(l[f.col]);
      if (!(v > 0)) continue;
      if (ehTotal) f.total = v;
      // [0] é a Área e [1] a Estrutura — mas o Comercial ora põe o código em [0] ("1.1") e o nome
      // em [1] ("Auditorio"), ora o nome em [0] ("ENC 0328"). Guarda os dois.
      else f.porArea.push({ area: String(l[0] ?? "").trim() || null, estrutura: String(l[1] ?? "").trim() || null, qtd: v });
    }
    if (ehTotal) break;
  }
  for (const f of familias) if (!f.total) f.total = f.porArea.reduce((a, x) => a + x.qtd, 0);
  return { aba: aba.nome, familias: familias.filter((f) => f.total > 0).map(({ col, ...f }) => f) };
}

/**
 * PLANILHA COMERCIAL — o resumo de venda: cada item com quantidade, preço e a quebra de custo
 * (material, mão de obra terceirizada, industrialização, BDI). É daqui que saem as VERBAS
 * (unidade "vb", tipicamente frete) e o TOTAL GERAL da obra.
 *
 * Vitor (19/08): "ainda falta as verbas, o resumo de tudo dessa planilha, custo com material,
 * custo estimado de fabricação, acessórios — tudo que tem, você precisa deixar robusto isso".
 */
function lerPlanilhaComercial(XLSX, wb) {
  const aba = acharAba(wb, "PLANILHA COMERCIAL");
  if (!aba) return null;
  const linhas = XLSX.utils.sheet_to_json(aba.ws, { header: 1, blankrows: false, defval: null });
  const cab = acharCabecalho(linhas, ["descricao", "quant"]);
  if (!cab) return { aba: aba.nome, erro: "cabeçalho de PLANILHA COMERCIAL não reconhecido" };
  const col = (r) => cab.cel.findIndex((c) => c.includes(norm(r)));
  // ⚠ "industrializacao" está DENTRO de "material para industrializacao" — com `includes` a coluna
  // de industrialização apontava pra de material e o total geral saía com o mesmo valor nas duas.
  const colExata = (r) => {
    const alvo = norm(r);
    const i = cab.cel.findIndex((c) => c === alvo);
    return i >= 0 ? i : cab.cel.findLastIndex((c) => c.includes(alvo));
  };
  const c = {
    item: col("item"), desc: cab.idx["descricao"], un: col("un"), qtd: cab.idx["quant"],
    unit: col("unit"), valor: col("valor r$"),
    material: col("material para industri"), mdo: col("mao de obra terceiriza"),
    indl: colExata("industrializacao"), bdi: col("bdi"), total: colExata("total"),
  };

  const itens = [];
  let totalGeral = null;
  for (let i = cab.i + 1; i < linhas.length; i++) {
    const l = linhas[i] || [];
    const rot = String(l[c.item] ?? "").trim();
    const desc = String(l[c.desc] ?? "").trim();
    const nRot = norm(rot);
    const valor = c.valor >= 0 ? num(l[c.valor]) : null;

    if (nRot.startsWith("total geral")) {
      totalGeral = {
        valor, material: c.material >= 0 ? num(l[c.material]) : null,
        mdoTerceirizada: c.mdo >= 0 ? num(l[c.mdo]) : null,
        industrializacao: c.indl >= 0 ? num(l[c.indl]) : null,
        bdi: c.bdi >= 0 ? num(l[c.bdi]) : null,
      };
      continue;
    }
    if (nRot.startsWith("subtotal") || !desc || !(valor > 0)) continue;

    const unidade = c.un >= 0 ? String(l[c.un] ?? "").trim() || null : null;
    itens.push({
      item: rot || null, descricao: desc.slice(0, 120), unidade,
      quantidade: c.qtd >= 0 ? num(l[c.qtd]) : null,
      unitario: c.unit >= 0 ? num(l[c.unit]) : null,
      valor,
      custoMaterial: c.material >= 0 ? num(l[c.material]) : null,
      mdoTerceirizada: c.mdo >= 0 ? num(l[c.mdo]) : null,
      industrializacao: c.indl >= 0 ? num(l[c.indl]) : null,
      bdi: c.bdi >= 0 ? num(l[c.bdi]) : null,
      // ⚠ VERBA = unidade "vb". É como o Comercial lança frete e serviços sem quantidade física.
      verba: /^vb$/i.test(unidade || ""),
    });
  }
  return { aba: aba.nome, itens, verbas: itens.filter((x) => x.verba), totalGeral };
}

/**
 * INDUSTRIALIZAÇÃO — a composição do custo: matéria-prima por tipo de perfil (com R$/kg),
 * fixadores e tintas. É o "custo estimado de fabricação" por trás do preço.
 */
function lerIndustrializacao(XLSX, wb) {
  const aba = acharAba(wb, "INDUSTRIALIZA");
  if (!aba) return null;
  const linhas = XLSX.utils.sheet_to_json(aba.ws, { header: 1, blankrows: false, defval: null });
  const cab = acharCabecalho(linhas, ["descricao", "subtotal"]);
  if (!cab) return { aba: aba.nome, erro: "cabeçalho de INDUSTRIALIZAÇÃO não reconhecido" };
  const col = (r) => cab.cel.findIndex((c) => c.includes(norm(r)));
  const cItem = col("item"), cDesc = cab.idx["descricao"], cEsp = col("especifi"),
        cPeso = col("peso total"), cUnit = col("preco unit"), cSub = cab.idx["subtotal"];

  const grupos = [];   // 1.1 MATÉRIA PRIMA, 1.2 FIXADORES, 1.3 TINTAS…
  const detalhes = []; // as linhas sem numeração, dentro de cada grupo
  let atual = null;
  for (let i = cab.i + 1; i < linhas.length; i++) {
    const l = linhas[i] || [];
    const rot = String(l[cItem] ?? "").trim();
    const desc = String(l[cDesc] ?? "").trim();
    const sub = cSub >= 0 ? num(l[cSub]) : null;
    if (!desc) continue;
    const reg = {
      item: rot || null, descricao: desc.slice(0, 90),
      especificacao: cEsp >= 0 ? String(l[cEsp] ?? "").trim() || null : null,
      pesoKg: cPeso >= 0 ? num(l[cPeso]) : null,
      precoKg: cUnit >= 0 ? num(l[cUnit]) : null,
      subtotal: sub,
    };
    if (/^\d/.test(rot)) { atual = { ...reg, itens: [] }; grupos.push(atual); }
    else if (sub > 0) { (atual?.itens || detalhes).push(reg); }
  }
  // O custo total é a soma dos grupos de 1º nível (1 MATERIAL, 2 MÃO DE OBRA TERCEIRIZADA,
  // 3 INDUSTRIALIZAÇÃO) — pegar só o grupo 1 devolvia apenas o material.
  const topo = grupos.filter((g) => /^\d+$/.test(String(g.item || "")));
  const total = topo.reduce((a, g) => a + (g.subtotal || 0), 0) || null;
  const porGrupo = Object.fromEntries(topo.map((g) => [g.descricao, g.subtotal]));
  return { aba: aba.nome, grupos, topo, porGrupo, total };
}

/**
 * Lê o estudo inteiro.
 * @param {Buffer|Uint8Array} buffer  xlsx/xlsm baixado do SharePoint
 * @returns {Promise<object>} { abas, aco, pintura, cobertura, calhasRufos, faltando[] }
 */
export async function lerEstudoComercial(buffer) {
  const XLSX = await import("xlsx");
  // ⚠ SheetJS, não ExcelJS: o estudo passa de 9 MB em alguns casos e o ExcelJS estoura memória
  // (foi o mesmo problema do import do CMR).
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });

  const modelo = wb.SheetNames.some((n) => norm(n) === "mc_tintas" || norm(n) === "resumos_em") ? "LQC" : "EPC";

  // No modelo NOVO o peso vem do RESUMOS_EM (por área) e o PESO PROJETO é só o detalhamento —
  // quando o método é ESTIMATIVA ele vem inteiro zerado.
  const resumo = lerResumosEm(XLSX, wb);
  const detalhe = lerPesoProjeto(XLSX, wb);
  const aco = modelo === "LQC" && resumo && !resumo.erro && resumo.pesoKg
    ? { ...resumo, detalhePerfis: detalhe?.perfis || [] }
    : detalhe;

  const pintura = modelo === "LQC" ? (lerMcTintas(XLSX, wb) || lerPintura(XLSX, wb)) : lerPintura(XLSX, wb);
  // A coluna de área de pintura do RESUMOS_EM não tem cabeçalho reconhecível em parte dos
  // estudos; o MC_TINTAS traz a mesma área e é a fonte mais confiável dela.
  if (aco && !aco.erro && !(aco.areaPinturaM2 > 0)) {
    const daTinta = (pintura?.itens || []).map((i) => i.areaM2).filter((n) => n > 0);
    if (daTinta.length) aco.areaPinturaM2 = Math.max(...daTinta);
  }
  const familias = lerItensComerciais(XLSX, wb);
  const comercial = lerPlanilhaComercial(XLSX, wb);
  const custos = lerIndustrializacao(XLSX, wb);
  const cobertura = modelo === "LQC" ? null : lerCobertura(XLSX, wb);
  const calhasRufos = lerCalhasRufos(XLSX, wb);

  const faltando = [];
  if (!aco || aco.erro) faltando.push(`peso do aço (${modelo === "LQC" ? "RESUMOS_EM" : "PESO PROJETO"})`);
  if (!pintura || pintura.erro) faltando.push(`tinta (${modelo === "LQC" ? "MC_TINTAS" : "PINTURA"})`);
  if (modelo === "LQC" && (!familias || familias.erro)) faltando.push("famílias (QTDS ITENS COMERCIAIS)");

  if (!comercial || comercial.erro) faltando.push("resumo comercial (PLANILHA COMERCIAL)");
  // ⚠ a aba pode ser lida sem que a linha "TOTAL GERAL" seja encontrada — aí os itens vêm e o
  // total não. Sem este aviso o estudo entrava "completo" com o total em branco.
  else if (!comercial.totalGeral?.valor) faltando.push("total geral do orçamento (linha TOTAL GERAL)");
  if (!custos || custos.erro) faltando.push("custo de fabricação (INDUSTRIALIZAÇÃO)");

  return { modelo, abas: wb.SheetNames, aco, pintura, familias, comercial, custos, cobertura, calhasRufos, faltando };
}

/** Nome do arquivo → { numero, ano, revisao, cliente, obra }. Ex: EPC-084-26-R2-JHSF-PORT-COCHERE */
export function lerNomeEstudo(nome) {
  const n = String(nome || "");
  // NOVO: LQC-271-26-AYOSHII-FUCAMP-AUD.-TORG-R00.xlsx (revisão no FIM)
  let m = n.match(/^LQC-(\d+)-(\d+)-(.+?)-R(\d+)\.(xlsx|xlsm|xlsb)$/i);
  if (m) return { modelo: "LQC", numero: m[1], ano: m[2], resto: m[3], revisao: Number(m[4]) };
  // ANTIGO: EPC-084-26-R2-JHSF-PORT-COCHERE.xlsx (revisão no MEIO)
  m = n.match(/^EPC-(\d+)-(\d+)-R(\d+)-(.+?)\.(xlsx|xlsm|xlsb)$/i);
  if (m) return { modelo: "EPC", numero: m[1], ano: m[2], revisao: Number(m[3]), resto: m[4] };
  return null;
}
