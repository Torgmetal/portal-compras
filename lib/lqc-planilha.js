import "server-only";
import { getAccessToken } from "./sharepoint";
import { abrirXlsx, escreverCelulas, forcarRecalculo, fecharXlsx, adicionarAba } from "./xlsx-patch";
import { calcularLqc, fluxoDeCaixa, BDI_CAMPOS, LINHAS_FATURAMENTO, ITENS_COMERCIAIS, CFOPS, ENSAIOS, BASES_ENSAIO, CLASSES, precoPreMontagem } from "./lqc";

// ─── EXPORTAR O ESTUDO NO MODELO LQC ──────────────────────────────────────────
// Vitor (22/08/2026): "quando eu pedir para extrair uma planilha, você iria trazer exatamente o
// mesmo modelo preenchido".
//
// ⚠ "EXATAMENTE O MESMO MODELO" SÓ SE FOR O MODELO. Recriar a planilha do zero produziria um
// arquivo parecido e morto: sem as fórmulas, sem as tabelas nomeadas (ESTIMATIVAS, IND_MAT_PRIMA,
// MDO_GALV…), sem as validações das listas e sem a formatação que o Comercial reconhece. Então o
// caminho é o contrário: abrir o `LQC-000-00-CLIENTE-OBRA-TORG-R00.xlsx` que está no servidor,
// escrever nas células de ENTRADA e devolver o arquivo. O Excel recalcula o resto sozinho.
//
// ⚠ E NÃO SE RECONSTRÓI O ARQUIVO. A primeira versão usava ExcelJS e Vitor achou na hora: "fui
// tentar baixar a planilha, mas ela está quebrada". ExcelJS não reescreve um .xlsx complexo — ele
// o remonta com o que entendeu, e sumiram 16 partes do modelo (customXml, docProps/custom,
// metadata, os pivotCache e pivotTables, printerSettings), além de renumerar as planilhas. O
// Excel abre isso como arquivo corrompido. Agora a escrita é no XML, dentro do ZIP, com todo o
// resto intocado — ver lib/xlsx-patch.
//
// ⚠ E POR ISSO SÓ SE ESCREVE ONDE NÃO HÁ FÓRMULA. A LQC se calcula: INDUSTRIALIZAÇÃO puxa peso da
// RESUMOS_EM, preço da PARÂMETROS e tinta da MC_TINTAS. Escrever um valor em cima de uma fórmula
// mataria a corrente inteira — e o estudo passaria a mentir na primeira alteração que alguém
// fizesse no arquivo. Mapa das entradas abaixo, conferido célula a célula no modelo.

const NOME_MODELO = /^LQC-000-00-CLIENTE-OBRA-TORG-R00\.xlsx$/i;
const TTL_MS = 30 * 60 * 1000;
let cacheModelo = null; // { em, buffer, nome }

/** Baixa (e guarda) o modelo em branco do servidor. */
export async function baixarModeloLqc(forcar = false) {
  if (!forcar && cacheModelo && Date.now() - cacheModelo.em < TTL_MS) return cacheModelo;
  const token = await getAccessToken();
  const drive = process.env.SHAREPOINT_DRIVE_ID;
  const busca = await (await fetch(
    `https://graph.microsoft.com/v1.0/drives/${drive}/root/search(q='LQC-000-00')?$select=id,name,lastModifiedDateTime,webUrl,parentReference&$top=25`,
    { headers: { Authorization: `Bearer ${token}` } }
  )).json();
  const achados = (busca.value || []).filter((x) => NOME_MODELO.test(x.name));
  if (!achados.length) throw new Error("Modelo LQC-000-00-CLIENTE-OBRA-TORG-R00.xlsx não encontrado no servidor.");
  // ⚠ EXISTE MAIS DE UM LQC-000-00 NO SERVIDOR, e eles não são iguais (um tem 84 partes, outro
  // 82). Fica o MAIS RECENTE — mas qual foi usado viaja no resultado e aparece na tela: escolher
  // em silêncio entre dois modelos diferentes é como o preço de uma proposta muda sem ninguém
  // saber por quê.
  achados.sort((a, b) => new Date(b.lastModifiedDateTime) - new Date(a.lastModifiedDateTime));
  const r = await fetch(`https://graph.microsoft.com/v1.0/drives/${drive}/items/${achados[0].id}/content`, {
    headers: { Authorization: `Bearer ${token}` }, redirect: "follow",
  });
  if (!r.ok) throw new Error(`Download do modelo LQC: HTTP ${r.status}`);
  cacheModelo = {
    em: Date.now(), buffer: Buffer.from(await r.arrayBuffer()), nome: achados[0].name,
    caminho: decodeURIComponent(achados[0].parentReference?.path || "").replace("/drive/root:", "") || decodeURIComponent(achados[0].webUrl || ""),
    modificadoEm: achados[0].lastModifiedDateTime,
    duplicados: achados.length > 1 ? achados.length : 0,
  };
  return cacheModelo;
}

// Mapa das células de ENTRADA, conferido no modelo. Fórmula nenhuma aparece aqui — de propósito.
const RESUMOS = { primeiraLinha: 4, ultimaLinha: 14, cols: { item: "A", area: "B", estrutura: "C", elemento: "D", metodo: "E", classificacao: "F", un: "G", quantidade: "H", unidades: "I", pesoUnit: "J", perfil: "L", coef: "M" } };
const QTDS = { primeiraLinha: 5, ultimaLinha: 10, area: "A", estrutura: "B", familias: { TELHA_TERMO: "C", TELHA_SIMPLES: "D", CALHAS: "E", RUFOS: "F", LANTERNIM: "G", VENEZIANAS: "H", CHUMBADORES: "I", STEEL_DECK: "J", LINHA_VIDA: "K", GRADE_PISO: "L" } };
// FATURAMENTO (coluna D) e PREÇO UNITÁRIO (coluna F) de cada grupo da INDUSTRIALIZAÇÃO.
const IND = {
  faturamento: { materiaPrima: "D5", fixadores: "D19", tintas: "D21", CALCULO: "D26", GALVANIZACAO: "D28", QUALIDADE: "D31", FRETE: "D33", OUTROS: "D35", fabricacao: "D40", pintura: "D46", preMontagem: "D52" },
  preco: { tubo: "F18", fixadores: "F20", CALCULO: "F27", GALVANIZACAO: "F29", GALV_FRETE: "F30", QUALIDADE: "F32", FRETE: "F34" },
  // ⚠ a PRÉ-MONTAGEM é escolhida na coluna "Especifiação" das 5 linhas de 3.3, e é ela que o
  // `F53 = INDEX(PARÂMETROS!$J$2:$Q$7; …; MATCH([Especifiação]; …))` usa pra achar o preço.
  // Sem escrever aqui, a pré-montagem sai zerada na planilha por mais que o portal a cobre.
  preMontagem: ["C53", "C54", "C55", "C56", "C57"],
};
// MC_TINTAS: duas linhas de tinta no modelo, uma por fator de perda (45% e 85%).
const TINTAS = { linhas: [5, 8], cols: { camada: "B", produto: "C", cor: "D", solidos: "E", peliculaSeca: "F", precoLitro: "J", qtdDiluente: "L", precoDiluente: "M" } };
// BDI — a aba que também é a de IMPOSTOS. D10..D16 é a composição do BDI (em fração: 5% = 0,05);
// I24..I29 é o CFOP de cada linha de faturamento, que escolhe a coluna da tabela de tributos.
const BDI = {
  composicao: { administracao: "D10", seguro: "D11", risco: "D12", impostos: "D13", factoring: "D14", margem: "D15", comissoes: "D16" },
  cfop: { ITENS_COMERCIAIS: "I24", MATERIAL_IND: "I25", PROJETO: "I26", INDUSTRIALIZACAO: "I27", MONTAGEM: "I28", EQUIPAMENTOS: "I29" },
};
// ITENS COMERCIAIS — linha do grupo (faturamento na coluna C) e a linha do produto logo abaixo
// (preço unitário na coluna E). A quantidade vem da aba QTDS por fórmula, então não se escreve.
const ITENS_LINHAS = { TELHA_TERMO: 4, TELHA_SIMPLES: 10, CALHAS: 16, RUFOS: 23, LANTERNIM: 30, VENEZIANAS: 35, CHUMBADORES: 40, STEEL_DECK: 45, LINHA_VIDA: 52, GRADE_PISO: 61 };

const val = (v) => (v === undefined || v === null || v === "" ? null : v);

/**
 * Preenche o modelo com o estudo.
 * @returns {{ buffer: Buffer, nome: string, avisos: string[] }}
 */
export async function gerarPlanilhaLqc(estudo) {
  const modelo = await baixarModeloLqc();
  const { zip, abas } = abrirXlsx(modelo.buffer);

  const avisos = [];
  const c = estudo.composicao || {};
  // ⚠ o cálculo é feito UMA vez e reusado: as abas novas e as células de entrada precisam
  // contar a mesma história. Recalcular em cada trecho é como duas contas divergirem sem motivo.
  const res = calcularLqc({ ...c, preMontagem: estudo.preMontagem });
  const nulo = (v) => v === undefined || v === null || v === "" || (typeof v === "number" && !Number.isFinite(v));
  const numOuNulo = (v) => { const x = Number(v); return Number.isFinite(x) && String(v).trim() !== "" ? x : null; };

  // Aplica um lote de células numa aba, de uma vez só.
  const gravar = (nomeAba, valores) => {
    const caminho = abas[nomeAba];
    if (!caminho || !zip.file(caminho)) { avisos.push(`Aba ${nomeAba} não encontrada no modelo.`); return; }
    const limpos = Object.fromEntries(Object.entries(valores).filter(([, v]) => !nulo(v)));
    if (!Object.keys(limpos).length) return;
    const { xml, recusadas } = escreverCelulas(zip.file(caminho).asText(), limpos);
    zip.file(caminho, xml);
    if (recusadas.length) avisos.push(`${nomeAba}: ${recusadas.join(", ")} têm fórmula e não foram sobrescritas.`);
  };

  // ── RESUMOS_EM: o quantitativo. É daqui que a INDUSTRIALIZAÇÃO tira o peso por classe e por
  //    categoria de perfil — por isso é a primeira aba a preencher.
  // ⚠ a planilha sai com o ESCOPO SELECIONADO — é ela que vira proposta. As áreas desmarcadas
  // continuam guardadas no estudo, mas escrevê-las aqui faria o arquivo cobrar o que não foi
  // vendido. O que ficou de fora vai nos avisos, para ninguém achar que sumiu.
  const todasResumos = Array.isArray(c.resumos) ? c.resumos : [];
  const resumos = todasResumos.filter((l) => l?.ativo !== false);
  const foraDoEscopo = todasResumos.length - resumos.length;
  if (foraDoEscopo > 0) avisos.push(`${foraDoEscopo} ${foraDoEscopo === 1 ? "área está" : "áreas estão"} fora do escopo selecionado e não ${foraDoEscopo === 1 ? "entrou" : "entraram"} na planilha.`);
  const cabem = RESUMOS.ultimaLinha - RESUMOS.primeiraLinha + 1;
  {
    const col = RESUMOS.cols, vals = {};
    resumos.slice(0, cabem).forEach((l, i) => {
      const linha = RESUMOS.primeiraLinha + i;
      vals[`${col.item}${linha}`] = l.item || `1.${i + 1}`;
      vals[`${col.area}${linha}`] = l.area;
      vals[`${col.estrutura}${linha}`] = l.estrutura;
      vals[`${col.elemento}${linha}`] = l.elemento;
      vals[`${col.metodo}${linha}`] = l.metodo || estudo.metodo || "ESTIMATIVA";
      vals[`${col.classificacao}${linha}`] = l.classificacao;
      vals[`${col.un}${linha}`] = l.un || "unid";
      vals[`${col.quantidade}${linha}`] = numOuNulo(l.quantidade);
      vals[`${col.unidades}${linha}`] = numOuNulo(l.unidades ?? 1);
      vals[`${col.pesoUnit}${linha}`] = numOuNulo(l.pesoUnit);
      vals[`${col.perfil}${linha}`] = l.perfil;
      vals[`${col.coef}${linha}`] = numOuNulo(l.coef);
    });
    gravar("RESUMOS_EM", vals);
    // ⚠ nada de corte silencioso: se não coube, tem que estar escrito.
    if (resumos.length > cabem) avisos.push(`RESUMOS_EM tem ${cabem} linhas no modelo e o estudo tem ${resumos.length} — as ${resumos.length - cabem} últimas não entraram.`);
  }

  // ── INDUSTRIALIZAÇÃO: só faturamento e os preços que a planilha NÃO calcula sozinha.
  {
    const fat = c.faturamento || {}, vals = {};
    for (const [k, addr] of Object.entries(IND.faturamento)) vals[addr] = fat[k] || "N/A";
    vals[IND.preco.tubo] = numOuNulo(c.precos?.perfil?.Tubo);
    vals[IND.preco.fixadores] = numOuNulo(c.fixadoresRsKg);
    for (const k of ["CALCULO", "GALVANIZACAO", "GALV_FRETE", "QUALIDADE", "FRETE"]) {
      vals[IND.preco[k]] = numOuNulo(c.terceirizados?.[k]?.precoKg);
    }
    // ⚠ havendo ensaios orçados, é o R$/kg deles que entra na linha 2.3 (Inspeção e Data Book):
    // a aba de ensaios é o detalhe daquele número, e deixar os dois brigando seria pior que
    // não ter detalhe nenhum.
    if (res.ensaios?.total > 0) vals[IND.preco.QUALIDADE] = res.ensaios.porKg;
    // ⚠ a LQC só conhece 10% e 100%: um percentual livre vira a âncora mais próxima NA PLANILHA,
    // e o número exato fica na aba PRÉ-MONTAGEM. Escrever "55%" ali quebraria o INDEX da linha.
    const pct = res.preMontagemPct || 0;
    const rotuloPre = pct <= 0 ? "N/A" : pct <= 55 ? "PRÉ-MONT. 10%" : "PRÉ-MONT. 100%";
    for (const addr of IND.preMontagem) vals[addr] = rotuloPre;
    if (pct > 0 && pct !== 10 && pct !== 100) {
      avisos.push(`Pré-montagem de ${pct}% não existe na LQC (só 10% e 100%): a planilha saiu com "${rotuloPre}" e o valor exato está na aba PRÉ-MONTAGEM.`);
    }
    gravar("INDUSTRIALIZAÇÃO", vals);
  }

  // ── MC_TINTAS: as duas linhas de tinta do modelo (45% e 85% de perda).
  {
    const vals = {}, col = TINTAS.cols;
    (c.tintas || []).slice(0, TINTAS.linhas.length).forEach((t, i) => {
      const linha = TINTAS.linhas[i];
      vals[`${col.camada}${linha}`] = t.camada;
      vals[`${col.produto}${linha}`] = t.produto;
      vals[`${col.cor}${linha}`] = t.cor;
      vals[`${col.solidos}${linha}`] = numOuNulo(t.solidos);
      vals[`${col.peliculaSeca}${linha}`] = numOuNulo(t.peliculaSeca);
      vals[`${col.precoLitro}${linha}`] = numOuNulo(t.precoLitro);
      vals[`${col.qtdDiluente}${linha}`] = numOuNulo(t.qtdDiluente);
      vals[`${col.precoDiluente}${linha}`] = numOuNulo(t.precoDiluente);
    });
    gravar("MC_TINTAS", vals);
    if ((c.tintas || []).length > TINTAS.linhas.length) avisos.push(`MC_TINTAS tem ${TINTAS.linhas.length} linhas no modelo e o estudo tem ${c.tintas.length}.`);
  }

  // ── QTDS ITENS COMERCIAIS: quantidade por área (telha, calha, rufo…).
  {
    const areas = Array.isArray(c.areasComerciais) ? c.areasComerciais : [];
    const cabemQ = QTDS.ultimaLinha - QTDS.primeiraLinha + 1;
    const vals = {};
    areas.slice(0, cabemQ).forEach((a, i) => {
      const linha = QTDS.primeiraLinha + i;
      vals[`${QTDS.area}${linha}`] = a.area;
      vals[`${QTDS.estrutura}${linha}`] = a.estrutura;
      for (const [k, cl] of Object.entries(QTDS.familias)) vals[`${cl}${linha}`] = numOuNulo(a[k]);
    });
    gravar("QTDS ITENS COMERCIAIS", vals);
    if (areas.length > cabemQ) avisos.push(`QTDS ITENS COMERCIAIS comporta ${cabemQ} áreas e o estudo tem ${areas.length}.`);
  }

  // ── BDI / IMPOSTOS: o que faltava e fazia a PLANILHA COMERCIAL sair sem BDI ──
  // Vitor (23/08/2026): "não vi aba de impostos… o preço da planilha comercial está errado".
  // Era isto: a composição do BDI e o CFOP de cada linha de faturamento nunca eram escritos, e
  // sem eles a planilha calculava BDI zero e imposto nenhum.
  {
    const bdi = c.bdi || {}, vals = {};
    for (const campo of BDI_CAMPOS) {
      const v = numOuNulo(bdi[campo.key]);
      // a célula é formatada em porcentagem: 5% se escreve como 0,05
      if (v !== null) vals[BDI.composicao[campo.key]] = v / 100;
    }
    for (const l of LINHAS_FATURAMENTO) {
      const cod = (c.cfops || {})[l.key] || l.padrao;
      if (cod) vals[BDI.cfop[l.key]] = Number(cod);
    }
    gravar("BDI", vals);
  }

  // ── ITENS COMERCIAIS: faturamento e preço unitário de cada família ──
  {
    const it = c.itensComerciais || {}, vals = {};
    for (const item of ITENS_COMERCIAIS) {
      const linha = ITENS_LINHAS[item.key];
      if (!linha) continue;
      const cfg = it[item.key] || {};
      vals[`C${linha}`] = cfg.faturamento || (c.faturamento?.itensComerciais || null);
      const preco = numOuNulo(cfg.preco ?? item.preco);
      if (preco !== null) vals[`E${linha + 1}`] = preco;
    }
    gravar("ITENS COMERCIAIS", vals);
  }

  forcarRecalculo(zip);

  // ── CENÁRIO FINANCEIRO: a aba nova, que não existe no modelo ──
  // ⚠ vai como aba PRÓPRIA e sem fórmula: é uma leitura do estudo, não parte do cálculo da LQC.
  // Enfiá-la no meio das abas existentes mexeria nas tabelas nomeadas e no que já funciona.
  try {
    const cfgCen = estudo.cenario || {};
    const cen = fluxoDeCaixa({
      meses: cfgCen.mesesFabricacao || 12,
      preco: res.preco, impostos: res.totalImpostos,
      material: res.totais?.material?.subtotal || 0,
      terceiros: res.totais?.mdo?.subtotal || 0,
      custoOperacionalMes: cfgCen.custoOperacionalMes || 0,
      reservaFinanceira: res.preco * ((res.bdiCampos?.factoring || 0) / 100),
    }, cfgCen);
    const linhas = [
      ["CENÁRIO FINANCEIRO"],
      [`${estudo.cliente || ""}${estudo.obra ? ` — ${estudo.obra}` : ""}`],
      [],
      ["Preço de venda", res.preco],
      ["Custo total", res.custo],
      ["  do qual faturado pela Torg", res.custoTorg],
      ["  do qual faturamento direto", res.custoDireto],
      ["BDI", res.bdiValor],
      ["Impostos sobre o faturamento", res.totalImpostos],
      [],
      ["Prazo de fabricação (meses)", cen.meses],
      ["Capital de giro no pior mês", cen.capitalDeGiro],
      ["Custo financeiro do período", cen.custoFinanceiro],
      ["Reservado no BDI (factoring)", cen.reservadoNoBdi],
      ["Diferença (reserva − custo real)", cen.diferenca],
      [],
      ["FLUXO DE CAIXA"],
      ["Mês", "Desembolso", "Recebimento", "Juros", "Saldo acumulado"],
      ...cen.fluxo.map((f) => [f.mes === 0 ? "início" : `mês ${f.mes}`, -f.saida || 0, f.entrada, -f.juros || 0, f.saldo]),
      [],
      ["IMPOSTOS POR LINHA DE FATURAMENTO"],
      ["Linha", "CFOP", "Base (R$)", "Carga (%)", "Imposto (R$)"],
      ...res.impostos.map((i) => [i.nome, i.cfop, i.base, i.cargaPct, i.valor]),
      [],
      ["Tabela de carga por CFOP"],
      ["CFOP", "Descrição", "Carga (%)"],
      ...CFOPS.map((f) => [f.cod, f.rotulo, Math.round((f.icms + 0.0165 * (1 - f.icms) + 0.076 * (1 - f.icms) + 0.0108 + 0.03 + f.iss) * 10000) / 100]),
    ];
    adicionarAba(zip, "CENÁRIO FINANCEIRO", linhas);
  } catch (err) {
    avisos.push(`Não consegui montar a aba do cenário financeiro: ${err.message}`);
  }

  // ── ENSAIOS: o detalhe do custo de qualidade, que a LQC só carrega como R$/kg ──
  try {
    const e = res.ensaios || { linhas: [], total: 0 };
    adicionarAba(zip, "ENSAIOS", [
      ["ENSAIOS DA QUALIDADE"],
      [`${estudo.cliente || ""}${estudo.obra ? ` — ${estudo.obra}` : ""}`],
      ["⚠ Frequência a confirmar contra a especificação da obra — a norma admite planos diferentes."],
      [],
      ["Ensaio", "Norma de referência", "Base", "1 a cada", "Universo", "Qtd.", "Custo unit. (R$)", "Total (R$)"],
      ...ENSAIOS.map((x) => {
        const l = e.linhas.find((y) => y.key === x.key) || {};
        return [x.nome, x.norma, BASES_ENSAIO[l.base || x.base] || "", l.cada || x.cada, l.universo || 0, l.qtd || 0, l.custoUnit || 0, l.total || 0];
      }),
      ["TOTAL", "", "", "", "", "", "", e.total],
      [],
      ["Peso da estrutura (kg)", res.pesoTotal],
      ["Área de pintura (m²)", res.areaM2],
      ["Custo de ensaios por kg (R$/kg)", e.porKg || 0],
      ["", "", "", "", "", "", "", ""],
      ["Este R$/kg é o que alimenta a linha 2.3 da INDUSTRIALIZAÇÃO (Inspeção e Data Book)."],
    ]);
  } catch (err) {
    avisos.push(`Não consegui montar a aba de ensaios: ${err.message}`);
  }

  // ── PRÉ-MONTAGEM: o percentual livre e o preço interpolado ──
  try {
    const pct = res.preMontagemPct || 0;
    const g = res.grupos?.preMontagem;
    adicionarAba(zip, "PRÉ-MONTAGEM", [
      ["PRÉ-MONTAGEM"],
      [`${estudo.cliente || ""}${estudo.obra ? ` — ${estudo.obra}` : ""}`],
      [`Percentual pré-montado: ${pct}%`],
      [pct === 10 || pct === 100 ? "Preço tabelado na PARÂMETROS." : "Preço interpolado entre as âncoras de 10% e 100% da PARÂMETROS."],
      [],
      ["Classe", "Faixa", "Peso (kg)", "R$/kg a 10%", "R$/kg a 100%", "R$/kg aplicado", "Custo (R$)"],
      ...CLASSES.map((cl, i) => {
        const l = g?.linhas?.[i] || {};
        return [cl.nome, cl.faixa, l.pesoKg || 0, cl.preMont10, cl.preMont100, precoPreMontagem(cl, pct), l.subtotal || 0];
      }),
      ["TOTAL", "", g?.total?.pesoKg || 0, "", "", "", g?.total?.subtotal || 0],
    ]);
  } catch (err) {
    avisos.push(`Não consegui montar a aba de pré-montagem: ${err.message}`);
  }

  const nome = `LQC-${String(estudo.numero || 0).padStart(3, "0")}-${String(estudo.ano || new Date().getFullYear()).slice(-2)}-${(estudo.cliente || "CLIENTE")}-${(estudo.obra || "OBRA")}-TORG-R${String(estudo.revisao || 0).padStart(2, "0")}`
    .toUpperCase().replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "-").slice(0, 120);
  // ⚠ quatro arquivos "LQC-000-00" convivem no servidor e não são iguais. Qual virou este
  // arquivo vai no cabeçalho X-Modelo; aqui fica só o alerta de que houve escolha.
  if (modelo.duplicados) avisos.push(`Há ${modelo.duplicados} arquivos "LQC-000-00" no servidor — usei o mais recente. Vale deixar um só.`);
  return { buffer: fecharXlsx(zip), nome: `${nome}.xlsx`, avisos, modelo: { nome: modelo.nome, caminho: modelo.caminho, modificadoEm: modelo.modificadoEm } };
}
