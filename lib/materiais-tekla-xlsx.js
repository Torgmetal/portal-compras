// ─── O XLSX DA PLANILHA DE MATERIAIS DO TEKLA — GERAR E LER DE VOLTA ─────────────────────────────
//
// Separado de lib/materiais-tekla.js (a classificação e a leitura das descrições) só por tamanho: o
// arquivo passava do teto de 350 linhas. Quem usa continua importando de lá — ele reexporta daqui.
//
// ⚠ AS ABAS DE DADOS COMEÇAM NA LINHA 1, sem logo nem bloco de controle em cima: quem lê é uma
// importação do Tekla. A identificação fica na aba "Leia-me" (ver o cabeçalho de materiais-tekla.js).

// Cores do padrão das planilhas da Torg (lib/excel-relatorio.js)
const HEADER_BG = "FF00406B", TORG_DARK = "FF002945", TORG_GRAY = "FF576D7E", LIGHT = "FFEBF5FB";
const COLUNAS_PERFIS = [
  { header: "Código Omie", key: "codigo", width: 14, texto: true },
  { header: "Descrição (Omie)", key: "descricao", width: 66 },
  { header: "Tipo", key: "tipo", width: 18 },
  { header: "Designação", key: "designacao", width: 26 },
  { header: "Peso (kg/m)", key: "pesoKgM", width: 12, numero: true },
  { header: "Material / norma", key: "material", width: 24 },
  { header: "Unidade", key: "unidade", width: 9 },
  { header: "Novo", key: "novo", width: 7 },
];
const COLUNAS_PARAFUSOS = [
  { header: "Código Omie", key: "codigo", width: 14, texto: true },
  { header: "Descrição (Omie)", key: "descricao", width: 66 },
  { header: "Norma / classe", key: "norma", width: 24 },
  { header: "Diâmetro", key: "diametro", width: 11 },
  { header: "Comprimento", key: "comprimento", width: 13 },
  { header: "Cabeça", key: "cabeca", width: 12 },
  { header: "Acabamento", key: "acabamento", width: 19 },
  { header: "Unidade", key: "unidade", width: 9 },
  { header: "Novo", key: "novo", width: 7 },
];

function abaDeDados(wb, nome, colunas, linhas, novos) {
  const ws = wb.addWorksheet(nome, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = colunas.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  for (const l of linhas) ws.addRow({ ...l, novo: novos?.has(l.codigo) ? "sim" : "" });
  const cab = ws.getRow(1);
  cab.height = 20;
  cab.eachCell((cell) => {
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
    cell.alignment = { vertical: "middle" };
  });
  colunas.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    // ⚠ código como TEXTO: "501000049" viraria número e "01.42.00318" perderia o zero à esquerda
    if (c.texto) col.numFmt = "@";
    if (c.numero) col.numFmt = "0.0##";
    col.font = { name: "Arial", size: 10, color: { argb: TORG_DARK } };
  });
  cab.eachCell((cell) => { cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } }; });
  ws.eachRow((row, n) => {
    if (n > 1 && row.getCell("novo").value === "sim") {
      row.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT } }; });
    }
  });
  if (linhas.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colunas.length } };
  return ws;
}

/**
 * @param {{perfis:object[], parafusos:object[], novos?:Set<string>|null, sairam?:object[], alterados?:object[], geradoEm?:Date, anterior?:string|null}} op
 *   novos: null = primeira planilha da pasta (não há com o que comparar); sairam/alterados: ver mudancasDoCadastro
 * @returns {Promise<Buffer>}
 */
export async function gerarPlanilhaMateriaisTekla({ perfis, parafusos, novos = null, sairam = [], alterados = [], geradoEm = new Date(), anterior = null }) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Portal Torg Metal";
  wb.created = geradoEm;

  abaDeDados(wb, "Perfis", COLUNAS_PERFIS, perfis, novos);
  abaDeDados(wb, "Parafusos", COLUNAS_PARAFUSOS, parafusos, novos);

  const wsN = wb.addWorksheet("Mudanças", { views: [{ state: "frozen", ySplit: 1 }] });
  wsN.columns = [
    { header: "Mudança", key: "mudanca", width: 19 }, { header: "Grupo", key: "grupo", width: 11 }, { header: "Código Omie", key: "codigo", width: 14 },
    { header: "Descrição (Omie)", key: "descricao", width: 70 }, { header: "Descrição anterior", key: "anterior", width: 70 },
  ];
  wsN.getColumn(3).numFmt = "@";
  const grupoDe = new Map([...perfis.map((l) => [l.codigo, "Perfil"]), ...parafusos.map((l) => [l.codigo, "Parafuso"])]);
  const listaNovos = novos ? [
    ...perfis.filter((l) => novos.has(l.codigo)).map((l) => ({ mudanca: "Novo", grupo: "Perfil", codigo: l.codigo, descricao: l.descricao })),
    ...parafusos.filter((l) => novos.has(l.codigo)).map((l) => ({ mudanca: "Novo", grupo: "Parafuso", codigo: l.codigo, descricao: l.descricao })),
  ] : [];
  const mudancas = [
    ...listaNovos,
    ...sairam.map((l) => ({ mudanca: "Saiu do cadastro", grupo: l.grupo || "", codigo: l.codigo, descricao: "", anterior: l.descricao })),
    ...alterados.map((l) => ({ mudanca: "Descrição alterada", grupo: grupoDe.get(l.codigo) || "", codigo: l.codigo, descricao: l.descricao, anterior: l.anterior })),
  ];
  for (const l of mudancas) wsN.addRow(l);
  if (!novos) wsN.addRow({ mudanca: "—", descricao: "Primeira planilha da pasta: não há anterior para comparar." });
  else if (!mudancas.length) wsN.addRow({ mudanca: "—", descricao: "Nenhuma mudança em relação à planilha anterior (publicada manualmente)." });
  wsN.getRow(1).eachCell((cell) => {
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
  });

  const wsL = wb.addWorksheet("Leia-me");
  wsL.getColumn(1).width = 26; wsL.getColumn(2).width = 96;
  const quando = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(geradoEm);
  const linhasL = [
    ["TORG METAL — Materiais do Omie para o Tekla", ""],
    ["", ""],
    ["Gerada em", `${quando} (horário de Brasília)`],
    ["Origem", "Cadastro de produtos do Omie, lido na hora da geração."],
    ["Conteúdo", `${perfis.length} perfis e ${parafusos.length} parafusos ativos.`],
    ["Mudanças nesta planilha", novos
      ? `${listaNovos.length} novo(s), ${sairam.length} fora do cadastro, ${alterados.length} com descrição alterada (aba "Mudanças"; os novos também ficam destacados nas abas de dados)`
      : "primeira planilha da pasta"],
    ["Planilha anterior", anterior || "—"],
    ["", ""],
    ["Quando sai uma nova", "O portal confere o cadastro do Omie de segunda a sábado, às 6h30 e às 12h30. Se um perfil ou parafuso ENTRAR, SAIR ou tiver a DESCRIÇÃO ALTERADA em relação à última planilha desta pasta, gera um ARQUIVO NOVO (data e hora no nome). A planilha mais recente é a que vale."],
    ["Fora do cadastro", "Código que estava na planilha anterior e não está nesta: foi inativado ou excluído no Omie, mudou de família ou virou \"Cópia de …\". O Tekla não deve mais usar esse código."],
    ["Perfis", "Família Matéria Prima: perfil W, HP, I, U, dobrado e soldado (VS/CS/PS), cantoneira, tubo, barra e trilho."],
    ["Parafusos", "Família Fixadores: descrições que começam por PARAFUSO."],
    ["Fora da planilha", "Chapa; porca, arruela, chumbador, barra roscada e demais fixadores; \"Cópia de …\" do Omie; itens sem família no cadastro; produtos inativos."],
    ["Colunas de leitura", "Tipo, designação, peso, material, norma, diâmetro, comprimento, cabeça e acabamento são lidos da descrição do Omie. O que a descrição não diz com segurança fica em branco — o código e a descrição do Omie são a referência."],
  ];
  linhasL.forEach((l, i) => {
    const row = wsL.addRow(l);
    row.getCell(2).alignment = { wrapText: true, vertical: "top" };
    row.getCell(1).alignment = { vertical: "top" };
    row.getCell(1).font = { name: "Arial", size: 10, bold: true, color: { argb: i === 0 ? "FFFFFFFF" : TORG_DARK } };
    row.getCell(2).font = { name: "Arial", size: 10, color: { argb: TORG_GRAY } };
  });
  wsL.mergeCells("A1:B1");
  wsL.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
  wsL.getCell("A1").font = { name: "Arial", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
  wsL.getRow(1).height = 22;

  return Buffer.from(await wb.xlsx.writeBuffer());
}

const textoDaCelula = (v) => String(v?.text ?? v?.result ?? v ?? "").trim();

/**
 * O que uma planilha já publicada tem: código (coluna A) → descrição (coluna B) e grupo, das abas
 * Perfis e Parafusos.
 * @returns {Promise<Map<string, {descricao:string, grupo:string}>>}
 */
export async function descricoesDaPlanilha(buffer) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const itens = new Map();
  for (const [nome, grupo] of [["Perfis", "Perfil"], ["Parafusos", "Parafuso"]]) {
    const ws = wb.getWorksheet(nome);
    if (!ws) continue;
    ws.eachRow((row, n) => {
      if (n === 1) return;
      const codigo = textoDaCelula(row.getCell(1).value);
      if (codigo) itens.set(codigo, { descricao: textoDaCelula(row.getCell(2).value), grupo });
    });
  }
  return itens;
}

/** Os códigos que uma planilha já publicada tem (abas Perfis e Parafusos, coluna A). */
export async function codigosDaPlanilha(buffer) {
  return new Set((await descricoesDaPlanilha(buffer)).keys());
}
