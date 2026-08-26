import "server-only";
import { LOGO_EXCEL_B64 } from "./torg-logo-excel";

// ─── O PLP NA CARA DA TORG ────────────────────────────────────────────────────
// Vitor (26/08/2026): "precisamos criar um documento que seria nosso padrão para PLP (…) quero que
// faça igual fizemos nos documentos de inspeção, deixar ele no formato excel para ficar mais sério,
// preservar os campos de assinatura".
//
// O modelo que ele mandou (PLP-T078.xls, herdado do cliente) tem três folhas, e a estrutura é boa —
// o que muda é a identidade e o rigor de documento controlado:
//   FL 1  capa: dados de fabricação, cliente, índice geral, índice de revisões e ASSINATURAS
//   FL 2  1- Sistemas de Pintura do Empreendimento · 2- Especificações das Tintas
//   FL 3  3- Sistema de Pintura da Estrutura Metálica (item a item, com a cor de cada um)
//
// ⚠ EXCEL, NÃO PDF — e o motivo é o dele: "preservar os campos de assinatura". Um PDF fecha o
// documento; o PLP é assinado por três partes (quem faz, quem aprova e a fiscalização do cliente),
// e a última assina em campo, à caneta, no papel impresso. O arquivo tem de sair com o espaço para
// isso, não com uma imagem de assinatura.
//
// ⚠ CAMPO QUE O PORTAL NÃO SABE SAI EM BRANCO, com a linha para escrever — nunca com um palpite.
// Num documento da Qualidade, um campo preenchido errado é pior que um campo vazio: o vazio alguém
// completa, o errado alguém assina.

const NAVY = "FF002945";
const AZUL = "FF00406B";
const LARANJA = "FFF4801F";
const CINZA = "FF576D7E";
const BORDA = "FFB0BEC5";
const FUNDO_CAB = "FFEBF5FB";
const FUNDO_TIT = "FFF0F4F8";

const so = (v) => (v === null || v === undefined ? "" : String(v).trim());
const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "");

function borda(cell, cor = BORDA) {
  cell.border = {
    top: { style: "thin", color: { argb: cor } }, bottom: { style: "thin", color: { argb: cor } },
    left: { style: "thin", color: { argb: cor } }, right: { style: "thin", color: { argb: cor } },
  };
}
function preencher(cell, argb) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
}

/**
 * Cabeçalho de folha — igual nas três, como manda um documento controlado: quem abre a folha 3
 * solta tem de saber de que documento ela é, de que revisão e de que obra.
 */
function cabecalho(ws, wb, { plpNumero, revisao, data, folha, folhas, logoId }) {
  ws.mergeCells("A1:B4");
  if (logoId != null) ws.addImage(logoId, { tl: { col: 0.15, row: 0.25 }, ext: { width: 132, height: 44 } });

  ws.mergeCells("C1:H2");
  const t = ws.getCell("C1");
  t.value = "PLANO DE PINTURA";
  t.font = { name: "Arial", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
  t.alignment = { horizontal: "center", vertical: "middle" };
  preencher(t, NAVY);

  ws.mergeCells("C3:H3");
  const s = ws.getCell("C3");
  s.value = "Sistema de Gestão da Qualidade · documento controlado";
  s.font = { name: "Arial", size: 8, color: { argb: "FFFFFFFF" } };
  s.alignment = { horizontal: "center", vertical: "middle" };
  preencher(s, AZUL);

  // ⚠ o filete laranja é a assinatura visual da casa (mesma do e-mail e do PDF) — é o que faz o
  // documento ser reconhecido como Torg antes de alguém ler o cabeçalho.
  ws.mergeCells("C4:H4");
  const f = ws.getCell("C4");
  f.value = null;
  preencher(f, LARANJA);
  ws.getRow(4).height = 3;

  const campos = [
    ["I1", "PLP Nº", "J1", plpNumero || ""],
    ["I2", "Revisão", "J2", so(revisao) || "0"],
    ["I3", "Data", "J3", data || ""],
    ["I4", "Folha", "J4", `${folha} / ${folhas}`],
  ];
  for (const [cr, rot, cv, val] of campos) {
    const r = ws.getCell(cr); r.value = rot;
    r.font = { name: "Arial", size: 8, bold: true, color: { argb: NAVY } };
    r.alignment = { horizontal: "left", vertical: "middle" };
    preencher(r, FUNDO_CAB); borda(r);
    const v = ws.getCell(cv); v.value = val;
    v.font = { name: "Arial", size: 9, color: { argb: NAVY } };
    v.alignment = { horizontal: "center", vertical: "middle" };
    borda(v);
  }
  ws.getRow(1).height = 20; ws.getRow(2).height = 20; ws.getRow(3).height = 14;
  return 6; // primeira linha livre
}

function titulo(ws, linha, texto, ate = "J") {
  ws.mergeCells(`A${linha}:${ate}${linha}`);
  const c = ws.getCell(`A${linha}`);
  c.value = texto;
  c.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
  c.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
  preencher(c, AZUL);
  ws.getRow(linha).height = 18;
  return linha + 1;
}

function rotuloValor(ws, linha, pares, ate = "J") {
  // pares: [[rótulo, valor, colInicio, colFim], …] em letras de coluna
  for (const [rot, val, ci, cf] of pares) {
    const cr = ws.getCell(`${ci}${linha}`);
    cr.value = rot;
    cr.font = { name: "Arial", size: 7.5, bold: true, color: { argb: CINZA } };
    cr.alignment = { horizontal: "left", vertical: "top", indent: 1 };
    const cv = ws.getCell(`${ci}${linha + 1}`);
    cv.value = val;
    cv.font = { name: "Arial", size: 10, color: { argb: NAVY } };
    cv.alignment = { horizontal: "left", vertical: "middle", indent: 1, wrapText: true };
    if (cf && cf !== ci) { ws.mergeCells(`${ci}${linha}:${cf}${linha}`); ws.mergeCells(`${ci}${linha + 1}:${cf}${linha + 1}`); }
    for (const c of [cr, cv]) borda(c);
  }
  ws.getRow(linha).height = 12;
  ws.getRow(linha + 1).height = 20;
  return linha + 2;
}

function tabela(ws, linha, colunas, linhas, { alturaLinha = 18 } = {}) {
  // cabeçalho
  colunas.forEach((c, i) => {
    const cel = ws.getCell(linha, i + 1);
    cel.value = c.t;
    cel.font = { name: "Arial", size: 8, bold: true, color: { argb: "FFFFFFFF" } };
    cel.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    preencher(cel, NAVY); borda(cel, NAVY);
  });
  ws.getRow(linha).height = 22;
  let l = linha + 1;
  for (const row of linhas) {
    row.forEach((v, i) => {
      const cel = ws.getCell(l, i + 1);
      cel.value = v === null || v === undefined ? "" : v;
      cel.font = { name: "Arial", size: 9, color: { argb: NAVY } };
      cel.alignment = { horizontal: colunas[i]?.a || "left", vertical: "middle", wrapText: true, indent: colunas[i]?.a === "left" ? 1 : 0 };
      borda(cel);
    });
    ws.getRow(l).height = alturaLinha;
    l++;
  }
  return l;
}

/**
 * Bloco de ASSINATURAS — três partes, como no modelo: quem realizou, quem aprovou e a
 * fiscalização do cliente.
 *
 * ⚠ A LINHA DE ASSINATURA É UMA CÉLULA ALTA COM BORDA INFERIOR, não um "____________" digitado:
 * texto sublinhado desalinha ao imprimir e some se a coluna estica. E a data fica em campo
 * próprio — data escrita em cima da linha da assinatura é o que faz documento voltar da
 * fiscalização.
 */
function assinaturas(ws, linha, blocos) {
  linha = titulo(ws, linha, "APROVAÇÕES");
  const larg = ["A", "D", "G"];
  const fim = ["C", "F", "J"];
  blocos.forEach((b, i) => {
    const ci = larg[i], cf = fim[i];
    ws.mergeCells(`${ci}${linha}:${cf}${linha}`);
    const t = ws.getCell(`${ci}${linha}`);
    t.value = b.papel;
    t.font = { name: "Arial", size: 8, bold: true, color: { argb: "FFFFFFFF" } };
    t.alignment = { horizontal: "center", vertical: "middle" };
    preencher(t, CINZA); borda(t);

    ws.mergeCells(`${ci}${linha + 1}:${cf}${linha + 1}`);
    const n = ws.getCell(`${ci}${linha + 1}`);
    n.value = b.nome || "";
    n.font = { name: "Arial", size: 9, color: { argb: NAVY } };
    n.alignment = { horizontal: "center", vertical: "middle" };
    borda(n);

    // espaço da assinatura à caneta
    ws.mergeCells(`${ci}${linha + 2}:${cf}${linha + 2}`);
    const a = ws.getCell(`${ci}${linha + 2}`);
    a.value = "";
    a.border = { bottom: { style: "medium", color: { argb: NAVY } } };

    ws.mergeCells(`${ci}${linha + 3}:${cf}${linha + 3}`);
    const d = ws.getCell(`${ci}${linha + 3}`);
    d.value = b.data ? `Data: ${b.data}` : "Data: ____ / ____ / ________";
    d.font = { name: "Arial", size: 8, color: { argb: CINZA } };
    d.alignment = { horizontal: "center", vertical: "middle" };
  });
  ws.getRow(linha).height = 16;
  ws.getRow(linha + 1).height = 18;
  ws.getRow(linha + 2).height = 34;
  ws.getRow(linha + 3).height = 14;
  return linha + 5;
}

function rodape(ws, linha, plpNumero, revisao, ate = "J") {
  ws.mergeCells(`A${linha}:${ate}${linha}`);
  const c = ws.getCell(`A${linha}`);
  c.value = `PLP ${plpNumero} · Revisão ${so(revisao) || "0"} · Torg Metal — Estruturas Metálicas · documento controlado, proibida a reprodução sem autorização (ISO 9001)`;
  c.font = { name: "Arial", size: 7, italic: true, color: { argb: CINZA } };
  c.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(linha).height = 14;
}

function paginar(ws, folha, folhas, plpNumero) {
  ws.pageSetup = {
    paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
  };
  ws.headerFooter = {
    oddFooter: `&L&8&"Arial"PLP ${plpNumero}&C&8&"Arial"Documento controlado&R&8&"Arial"Folha ${folha} de ${folhas}`,
  };
}

/**
 * Gera o PLP no padrão Torg, em Excel, nas três folhas do modelo.
 *
 * @param {object} p
 *   plp      — o PlanoPintura da obra (demaos, itens, preparo, rugosidade…)
 *   op       — { numero, cliente, obra, refCliente, unidade, local }
 *   tintas   — as tintas do CMR desta obra (produto, fabricante, lote, validade)
 *   revisoes — [{ revisao, data, descricao, elaborado, verificado, aprovado }]
 *   usuario  — quem está emitindo
 */
export async function gerarPlpExcel({ plp = {}, op = {}, tintas = [], revisoes = [], usuario = null }) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Workspace Torg — Torg Metal";
  wb.created = new Date();

  // ⚠ TRÊS DÍGITOS, COMO NO MODELO: o PLP-T078 é "T078", não "T78". Tirar o zero à esquerda faz o
  // documento não casar com o nome do arquivo nem com a pasta da obra.
  const plpNumero = `T${so(op.numero).replace(/\D/g, "").padStart(3, "0") || "___"}`;
  // ⚠ A REVISÃO É O NÚMERO, não o rótulo. O campo `revisao` guarda o que veio do PLP do cliente
  // ("T067 R0", "Rev. 2"), e imprimir isso no campo REVISÃO faz o cabeçalho ler "Revisão T067 R0".
  // Tira o número; sem número, vale 0 (emissão inicial).
  const revisao = (so(plp.revisao).match(/(?:^|[^0-9])R?\.?\s*(\d{1,3})\s*$/)?.[1]) || (/^\d{1,3}$/.test(so(plp.revisao)) ? so(plp.revisao) : "0");
  const hoje = fmtD(new Date());
  const logoId = wb.addImage({ base64: LOGO_EXCEL_B64, extension: "png" });
  const FOLHAS = 3;

  // ══ FOLHA 1 — capa ══════════════════════════════════════════════════════════
  {
    const ws = wb.addWorksheet("FL 1", { views: [{ showGridLines: false }] });
    [16, 12, 14, 14, 12, 12, 12, 12, 12, 14].forEach((w, i) => (ws.getColumn(i + 1).width = w));
    let l = cabecalho(ws, wb, { plpNumero, revisao, data: hoje, folha: 1, folhas: FOLHAS, logoId });

    l = titulo(ws, l, "DADOS DE FABRICAÇÃO");
    l = rotuloValor(ws, l, [["OBRA", so(op.obra) || "", "A", "J"]]);
    // ⚠ SAIU A UNIDADE (melhoria do Vitor no modelo, 26/08/2026): a Torg entrega para o cliente na
    // obra, e "unidade" era coluna do modelo herdado que ficava vazia em toda obra nossa.
    l = rotuloValor(ws, l, [
      ["CLIENTE", so(op.cliente) || "", "A", "E"],
      ["LOCAL DA OBRA", so(op.local) || "", "F", "J"],
    ]);
    l = rotuloValor(ws, l, [
      ["ORDEM DE PRODUÇÃO", `OP-${so(op.numero)}`, "A", "C"],
      // ⚠ a referência do CLIENTE entra porque documento que vai ao cliente tem de trazer o código
      // dele — é por ele que a obra é achada do outro lado.
      ["REFERÊNCIA DO CLIENTE", so(op.refCliente) || "—", "D", "G"],
      ["Nº PC / CT", so(op.pedidoCliente) || "—", "H", "J"],
    ]);
    l = rotuloValor(ws, l, [["DOCUMENTOS DE REFERÊNCIA", so(plp.documentosReferencia) || "PO-05 — Pintura · NBR 16775", "A", "J"]]);
    l += 1;

    l = titulo(ws, l, "ÍNDICE GERAL");
    l = tabela(ws, l, [
      { t: "ITEM", a: "center" }, { t: "DESCRIÇÃO", a: "left" },
    ], [
      [1, "Sistemas de Pintura da Obra"],
      [2, "Especificações das Tintas"],
      [3, "Sistema de Pintura da Estrutura Metálica"],
    ]);
    // ⚠ o índice é mesclado depois de escrito: mesclar antes faz o ExcelJS perder o valor.
    for (let i = l - 3; i < l; i++) ws.mergeCells(`B${i}:J${i}`);
    l += 1;

    l = titulo(ws, l, "ÍNDICE DE REVISÕES");
    const linhasRev = (revisoes.length ? revisoes : [{ revisao, data: hoje, descricao: "Emissão inicial" }])
      .map((r) => [so(r.revisao) || "0", so(r.data) || hoje, so(r.descricao) || "", so(r.elaborado) || "", so(r.verificado) || "", so(r.aprovado) || ""]);
    // ⚠ três linhas em branco: revisão é escrita à mão na folha impressa até a próxima emissão.
    while (linhasRev.length < 4) linhasRev.push(["", "", "", "", "", ""]);
    l = tabela(ws, l, [
      { t: "REV.", a: "center" }, { t: "DATA", a: "center" }, { t: "DESCRIÇÃO", a: "left" },
      { t: "ELABORADO", a: "center" }, { t: "VERIFICADO", a: "center" }, { t: "APROVADO", a: "center" },
    ], linhasRev.map((r) => [r[0], r[1], r[2], r[3], r[4], r[5]]));
    for (let i = l - linhasRev.length; i < l; i++) ws.mergeCells(`C${i}:F${i}`);
    l += 1;

    l = assinaturas(ws, l, [
      { papel: "REALIZADO POR", nome: so(usuario) || "", data: hoje },
      { papel: "APROVADO POR", nome: "", data: null },
      { papel: "CLIENTE / FISCALIZAÇÃO", nome: "", data: null },
    ]);
    rodape(ws, l, plpNumero, revisao);
    paginar(ws, 1, FOLHAS, plpNumero);
  }

  // ══ FOLHA 2 — sistemas e especificações ═════════════════════════════════════
  {
    const ws = wb.addWorksheet("FL 2", { views: [{ showGridLines: false }] });
    [8, 22, 20, 14, 20, 14, 20, 14, 16, 16].forEach((w, i) => (ws.getColumn(i + 1).width = w));
    let l = cabecalho(ws, wb, { plpNumero, revisao, data: hoje, folha: 2, folhas: FOLHAS, logoId });

    l = titulo(ws, l, "1 — SISTEMAS DE PINTURA DA OBRA");
    const demaos = Array.isArray(plp.demaos) ? plp.demaos : [];
    const daOrdem = (n) => demaos.find((d) => Number(d?.ordem) === n) || demaos[n - 1] || null;
    const camada = (d) => (d ? `${so(d.produto) || so(d.nome) || "—"}` : "—");
    const esp = (d) => {
      if (!d) return "—";
      const a = d.espessuraMin, b = d.espessuraMax;
      const faixa = a && b ? `${a} a ${b}` : a || b || "";
      return faixa ? `1 demão / ${faixa} µm` : "1 demão";
    };
    // ⚠ preparo de superfície e rugosidade saem do PLP do portal (PO-05); sem eles, o campo vem
    // em branco para ser preenchido — nunca com o padrão fingindo ser o especificado.
    const preparo = [so(plp.preparoMetodo), so(plp.grauLimpeza) && `Grau ${so(plp.grauLimpeza)}`,
      (plp.rugosidadeMin || plp.rugosidadeMax) && `Rugosidade ${plp.rugosidadeMin || "—"} a ${plp.rugosidadeMax || "—"} µm`,
      so(plp.abrasivo) && `Abrasivo: ${so(plp.abrasivo)}`].filter(Boolean).join("\n") || "";
    l = tabela(ws, l, [
      { t: "SISTEMA", a: "center" }, { t: "PREPARAÇÃO DE SUPERFÍCIE", a: "left" },
      { t: "FUNDO", a: "left" }, { t: "DEMÃO / ESPESSURA", a: "center" },
      { t: "INTERMEDIÁRIA", a: "left" }, { t: "DEMÃO / ESPESSURA", a: "center" },
      { t: "ACABAMENTO (FÁBRICA)", a: "left" }, { t: "DEMÃO / ESPESSURA", a: "center" },
      { t: "ACABAMENTO (CAMPO)", a: "left" }, { t: "MÉTODO DE APLICAÇÃO", a: "left" },
    ], [[
      1, preparo,
      camada(daOrdem(1)), esp(daOrdem(1)),
      camada(daOrdem(2)), esp(daOrdem(2)),
      camada(daOrdem(3)), esp(daOrdem(3)),
      "—", so(plp.metodoAplicacao) || "",
    ], ["", "", "", "", "", "", "", "", "", ""]], { alturaLinha: 46 });
    if (plp.espessuraTotal) {
      ws.mergeCells(`A${l}:J${l}`);
      const c = ws.getCell(`A${l}`);
      c.value = `Espessura total do sistema (seca): ${plp.espessuraTotal} µm`;
      c.font = { name: "Arial", size: 9, bold: true, color: { argb: NAVY } };
      c.alignment = { horizontal: "right", vertical: "middle", indent: 1 };
      borda(c); preencher(c, FUNDO_TIT);
      ws.getRow(l).height = 18;
      l++;
    }
    l += 1;

    l = titulo(ws, l, "2 — ESPECIFICAÇÕES DAS TINTAS");
    // ⚠ as tintas vêm do CMR da obra: produto, fabricante e LOTE são o que dá rastreabilidade à
    // pintura. Diluição, camada úmida e secagem ficam para preencher — são dados da ficha técnica
    // do fabricante, e inventá-los num documento controlado seria grave.
    const linhasTinta = (tintas.length ? tintas : demaos).map((t) => [
      so(t.especificacao) || so(t.tipo) || so(t.nome) || "",
      so(t.produto) || "", so(t.fabricante) || "", so(t.lote) || so(t.rastreio) || "",
      "", "", "",
    ]);
    while (linhasTinta.length < 3) linhasTinta.push(["", "", "", "", "", "", ""]);
    l = tabela(ws, l, [
      { t: "ESPECIFICAÇÃO", a: "left" }, { t: "PRODUTO", a: "left" }, { t: "FABRICANTE", a: "left" },
      { t: "LOTE / R", a: "center" }, { t: "DILUIÇÃO", a: "left" }, { t: "CAMADA ÚMIDA", a: "center" },
      { t: "TEMPO DE SECAGEM", a: "left" },
    ], linhasTinta, { alturaLinha: 26 });
    for (let i = l - linhasTinta.length; i < l; i++) { ws.mergeCells(`G${i}:H${i}`); ws.mergeCells(`I${i}:J${i}`); }

    rodape(ws, l + 1, plpNumero, revisao);
    paginar(ws, 2, FOLHAS, plpNumero);
  }

  // ══ FOLHA 3 — a estrutura, item a item ══════════════════════════════════════
  {
    const ws = wb.addWorksheet("FL 3", { views: [{ showGridLines: false }] });
    [8, 40, 10, 10, 14, 22, 26, 10, 10, 12].forEach((w, i) => (ws.getColumn(i + 1).width = w));
    let l = cabecalho(ws, wb, { plpNumero, revisao, data: hoje, folha: 3, folhas: FOLHAS, logoId });

    l = titulo(ws, l, "3 — SISTEMA DE PINTURA DA ESTRUTURA METÁLICA");
    const itens = Array.isArray(plp.itens) ? plp.itens : [];
    const linhas = itens.map((it, i) => [
      i + 1, so(it.item), "NA", "X", so(it.sistema) || "1", so(it.cor), so(it.obs) || "—",
    ]);
    // ⚠ linhas em branco no fim: a estrutura ganha item em obra, e o documento impresso tem de ter
    // onde escrever sem virar rasura na margem.
    for (let i = 0; i < Math.max(3, 12 - linhas.length); i++) linhas.push(["", "", "", "", "", "", ""]);
    l = tabela(ws, l, [
      { t: "ITEM", a: "center" }, { t: "EQUIPAMENTO / CONJUNTO", a: "left" },
      { t: "INTERNO", a: "center" }, { t: "EXTERNO", a: "center" },
      { t: "SISTEMA", a: "center" }, { t: "COR DE ACABAMENTO", a: "left" }, { t: "OBSERVAÇÃO", a: "left" },
    ], linhas, { alturaLinha: 20 });
    for (let i = l - linhas.length; i < l; i++) ws.mergeCells(`G${i}:J${i}`);
    l += 1;

    if (so(plp.observacoes)) {
      l = titulo(ws, l, "OBSERVAÇÕES");
      ws.mergeCells(`A${l}:J${l + 2}`);
      const c = ws.getCell(`A${l}`);
      c.value = so(plp.observacoes);
      c.font = { name: "Arial", size: 9, color: { argb: NAVY } };
      c.alignment = { horizontal: "left", vertical: "top", wrapText: true, indent: 1 };
      borda(c);
      l += 4;
    }

    rodape(ws, l, plpNumero, revisao);
    paginar(ws, 3, FOLHAS, plpNumero);
  }

  return wb.xlsx.writeBuffer();
}
