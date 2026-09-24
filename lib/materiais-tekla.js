// ─── MATERIAIS DO OMIE PARA O TEKLA — SÓ PERFIS E PARAFUSOS ──────────────────────────────────────
//
// Vitor (24/09/2026): "estou criando uma pasta na engenharia, preciso que vc traga uma planilha
// atualizada sempre que um novo tipo de perfil for cadastrado no Omie, cadastrou vc cria uma planilha
// nova. Essa pasta vai alimentar o Tekla para ele ficar sempre atualizado com os cadastros. Essa
// planilha vamos deixar ela somente com perfis e parafusos".
//
// Pasta: SERVIDOR › Engenharia › Workspace › Materiais OMIE - Tekla. Cada cadastro novo gera um
// ARQUIVO NOVO, com data e hora no nome — nunca por cima do anterior; o mais recente é o que vale.
//
// ⚠ AS ABAS DE DADOS COMEÇAM NA LINHA 1, sem logo nem bloco de controle em cima. Quem lê é uma
// importação do Tekla, e cabeçalho decorativo em cima da tabela é o que quebra leitura automática.
// A identificação (origem, data, regra) fica na aba "Leia-me".
//
// Este arquivo é PURO — classificação, leitura da descrição e o xlsx. O que fala com o Omie e com o
// SharePoint mora em lib/materiais-tekla-publicar.js.

export const PASTA_TEKLA = "/Engenharia/Workspace/Materiais OMIE - Tekla";
export const PREFIXO_ARQUIVO = "Materiais OMIE - Tekla";

const sem = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

// ─── O QUE É PERFIL E O QUE É PARAFUSO ────────────────────────────────────────────────────────
//
// Pela FAMÍLIA do cadastro e pelo começo da descrição. Medido no cadastro em 24/09/2026 (2.498
// produtos): perfil, cantoneira, tubo e barra vivem em "Matéria Prima"; parafuso em "Fixadores".
// ⚠ Ficam de fora, de propósito:
//   • chapa — "somente perfis e parafusos";
//   • porca, arruela, chumbador, barra roscada, autobrocante — são fixadores, não parafusos;
//   • "Cópia de …" — sobra do "copiar produto" do Omie que ninguém renomeou;
//   • perfil esponjoso (borracha) — está em Matéria Prima, mas não é aço;
//   • item SEM FAMÍLIA — os códigos soltos importados ("01.42.00318", "PARAF CAB SEXT M10X40…"),
//     que repetem o que o catálogo padronizado já tem.

/** "PERFIL" | "PARAFUSO" | null */
export function grupoDoProduto(p) {
  if (!p || p.inativo) return null;
  const d = sem(p.descricao), fam = sem(p.familia);
  if (!d || d.startsWith("COPIA DE ")) return null;
  if (fam === "FIXADORES") return /^PARAF/.test(d) ? "PARAFUSO" : null;
  if (fam !== "MATERIA PRIMA") return null;
  if (/^PERFIL\b/.test(d)) return /ESPONJOS|BORRACHA/.test(d) ? null : "PERFIL";
  if (/^(CANTONEIRA|TUBO|BARRA|TRILHO)\b/.test(d)) return "PERFIL";
  if (/^(CVS|VS|CS|PS) ?\d{2,4} ?X ?\d/.test(d)) return "PERFIL"; // perfis soldados (NBR 5884)
  return null;
}

// ─── LER A DESCRIÇÃO ──────────────────────────────────────────────────────────────────────────
// ⚠ Só o que a descrição DIZ. Campo que não se lê com segurança fica vazio — nunca um chute: o
// Tekla vai tratar o que estiver aqui como cadastro.

// 6 · 2.1/2 · 2 1/2 · 1/4 · 9,5
// ⚠ não começa colada em outro número nem em hífen, e a forma com espaço ("1 1/2") só vale para inteiro de
// até dois dígitos: sem isso, "A-307 5/16\"" virava a bitola "307.5/16\"" (a norma grudada na polegada).
const POL = String.raw`(?<![\d/-])(?:\d{1,2} \d+\/\d+|\d+(?:\.\d+\/\d+|\/\d+|[.,]\d+)?)`;
const pol = (t) => String(t).replace(" ", "."); // "1 1/2" → "1.1/2", a grafia do resto da planilha
const NUM = String.raw`\d+(?:[.,]\d+)?`;
const xis = (t) => String(t).replace(/\s*X\s*/gi, " x ");

/** Peso de um texto "31,3" ou "12.20" → número. */
function decimal(t) {
  const s = String(t || "").trim();
  if (!s) return null;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : null;
}

function materialDe(d) {
  const achados = [
    [/\bA ?-? ?572\b(?: ?GR\.? ?(\d+))?/, (m) => `ASTM A572${m[1] ? ` GR.${m[1]}` : ""}`],
    [/\bA ?-? ?240\b.*?\bTP\.? ?(\d{3})/, (m) => `ASTM A240 TP.${m[1]} (inox)`],
    [/\bA ?-? ?36\b/, () => "ASTM A36"],
    [/\bASTM ?A ?-? ?(\d{3})\b/, (m) => `ASTM A${m[1]}`],
    [/\bSAE ?-? ?(\d{4})\b/, (m) => `SAE ${m[1]}`],
    [/\bAISI ?(\d{3})\b/, (m) => `AISI ${m[1]} (inox)`],
    [/\bNBR ?(\d{4,5})\b/, (m) => `NBR ${m[1]}`],
    [/\bCA ?-? ?50\b/, () => "CA-50"],
    [/\bMULTINORMAS\b/, () => "Multinormas comercial"],
  ];
  for (const [re, f] of achados) { const m = d.match(re); if (m) return f(m); }
  return null;
}

/**
 * @returns {{tipo:string, designacao:string|null, pesoKgM:number|null, material:string|null}}
 */
export function lerPerfil(descricao) {
  const d = sem(descricao);
  const material = materialDe(d);
  const r = (tipo, designacao = null, pesoKgM = null) => ({ tipo, designacao, pesoKgM, material });
  let m;

  if (/^(CVS|VS|CS|PS) ?\d/.test(d)) {
    m = d.match(new RegExp(`^(CVS|VS|CS|PS) ?(${NUM}(?: ?X ?${NUM})+)`));
    return r("Perfil soldado", m ? `${m[1]} ${xis(m[2])}` : null);
  }
  if (/^TRILHO\b/.test(d)) { m = d.match(/\bTR ?(\d+)/); return r("Trilho", m ? `TR ${m[1]}` : null); }

  if (/^PERFIL DOBRADO\b/.test(d)) {
    m = d.match(new RegExp(`^PERFIL DOBRADO (?:ESP\\.? |TIPO )?([A-Z]+(?: [A-Z]+)?) ?(${NUM}(?: ?X ?${NUM})+)`));
    return r("Perfil dobrado", m ? `${m[1]} ${xis(m[2])}` : null);
  }
  if (/^PERFIL\b/.test(d)) {
    m = d.match(new RegExp(`\\b(WH|W|HP) ?(\\d{2,4}) ?X ?(${NUM}) ?KG`));
    if (m) return r(m[1] === "HP" ? "Perfil HP" : "Perfil W", `${m[1]} ${m[2]} x ${m[3]}`, decimal(m[3]));
    m = d.match(new RegExp(`^PERFIL "?(U|I)"?\\b.*?(${POL}) ?(?:POL|") ?X ?(${NUM}) ?KG`));
    if (m) return r(`Perfil ${m[1]}`, `${m[1]} ${m[2]}" x ${m[3]}`, decimal(m[3]));
    return r("Perfil");
  }

  if (/^CANTONEIRA\b/.test(d)) {
    m = d.match(new RegExp(`\\bDN?\\.? ?(${POL}) ?X ?(${POL}) ?POL`));
    if (m) return r("Cantoneira", `L ${pol(m[2])}" x ${pol(m[1])}"`); // no Omie vem ESPESSURA x ABA
    m = d.match(new RegExp(`^CANTONEIRA (${POL}) ?" ?X ?(${POL}) ?"`));
    if (m) return r("Cantoneira", `L ${pol(m[1])}" x ${pol(m[2])}"`); // escrita com aspas: ABA x ESPESSURA
    m = d.match(new RegExp(`DOBRAD[AO] (${NUM}(?: ?X ?${NUM})+)`));
    if (m) return r("Cantoneira dobrada", `L ${xis(m[1])}`);
    return r("Cantoneira");
  }

  if (/^TUBO\b/.test(d)) {
    let tipo = /RETANG/.test(d) ? "Tubo retangular" : /QUADRAD/.test(d) ? "Tubo quadrado" : "Tubo redondo";
    const sch = d.match(/\bSCH ?(\d+)/)?.[1];
    const comSch = (t) => (sch && !/SCH/.test(t) ? `${t} SCH ${sch}` : t);
    if ((m = d.match(new RegExp(`(?:Ø ?)?\\b(${POL}) ?(?:"|POL)? ?SCH ?(\\d+)`)))) return r(tipo, `Ø ${pol(m[1])}" SCH ${m[2]}`);
    if ((m = d.match(new RegExp(`(?:RETANGULAR|QUADRADO) (${NUM}(?: ?X ?${NUM})+) ?MM`)))) return r(tipo, `${xis(m[1])} mm`);
    if ((m = d.match(new RegExp(`\\((${NUM})\\) ?X ?(${NUM}) ?MM`)))) return r(tipo, comSch(`Ø ${m[1]} x ${m[2]} mm`));
    if ((m = d.match(new RegExp(`\\bDN\\.? ?(${POL}) ?POL ?X ?(${NUM}) ?MM`)))) return r(tipo, comSch(`DN ${pol(m[1])}" x ${m[2]} mm`));
    if ((m = d.match(new RegExp(`\\bDN?\\.? ?(${NUM}) ?X ?(${NUM}) ?MM`)))) return r(tipo, comSch(`Ø ${m[1]} x ${m[2]} mm`));
    // HSS, metalon, "TUBO 6mm - 100x50x1,50": três medidas são seção retangular (ou quadrada) x parede
    if ((m = d.match(new RegExp(`\\b(${NUM}) ?X ?(${NUM}) ?X ?(${NUM})\\b`)))) {
      if (!/RETANG|QUADRAD/.test(d)) tipo = decimal(m[1]) === decimal(m[2]) ? "Tubo quadrado" : "Tubo retangular";
      return r(tipo, `${m[1]} x ${m[2]} x ${m[3]} mm`);
    }
    // "Ø7/8X2.00": a descrição não diz a unidade de cada medida — sai como está
    if ((m = d.match(new RegExp(`Ø ?(${POL}) ?X ?(${NUM})`)))) return r(tipo, `Ø ${pol(m[1])} x ${m[2]}`);
    return r(tipo);
  }

  if (/^BARRA\b/.test(d)) {
    const tipo = /CHATA/.test(d) ? "Barra chata" : /QUADRAD/.test(d) ? "Barra quadrada" : /SEXTAV/.test(d) ? "Barra sextavada" : "Barra redonda";
    if (tipo === "Barra chata") {
      m = d.match(new RegExp(`\\bDN?\\.? ?(${POL}) ?X ?(${POL}) ?POL`));
      return r(tipo, m ? `${m[1]}" x ${m[2]}"` : null);
    }
    if ((m = d.match(new RegExp(`(?:\\bDN?\\.?|Ø) ?(${POL}) ?POL`)))) return r(tipo, tipo === "Barra redonda" ? `Ø ${m[1]}"` : `${m[1]}"`);
    if ((m = d.match(new RegExp(`(${NUM}) ?MM`)))) return r(tipo, tipo === "Barra redonda" ? `Ø ${m[1]} mm` : `${m[1]} mm`);
    return r(tipo);
  }
  return r("Perfil");
}

/**
 * @returns {{norma:string|null, diametro:string|null, comprimento:string|null, cabeca:string|null, acabamento:string|null}}
 */
export function lerParafuso(descricao) {
  const d = sem(descricao);
  let diametro = null, comprimento = null, m;
  if ((m = d.match(new RegExp(`(${POL}) ?" ?(?:- ?\\d+ ?UNC ?)?X ?(${POL}) ?"`)))) { diametro = `${pol(m[1])}"`; comprimento = `${pol(m[2])}"`; }
  else if ((m = d.match(new RegExp(`(${POL}) ?" ?X ?(${NUM}) ?MM`)))) { diametro = `${pol(m[1])}"`; comprimento = `${m[2]} mm`; }
  else if ((m = d.match(new RegExp(`\\bM ?(${NUM}) ?X ?(${NUM})`)))) { diametro = `M${m[1]}`; comprimento = `${m[2]} mm`; }

  const partes = [];
  const astm = d.match(/\bA ?-? ?(325|307|490|394|193)\b(?: ?(?:GR\.? ?)?(B7))?/);
  if (astm) partes.push(`ASTM A${astm[1]}${astm[2] ? ` ${astm[2]}` : ""}`);
  const din = [...d.matchAll(/\bDIN ?(\d{2,4})\b/g)].map((x) => x[1]).filter((n) => n !== "267"); // 267 é a norma da classe, não da peça
  if (din.length) partes.push(`DIN ${[...new Set(din)].join("/")}`);
  const classe = d.match(/\b(4\.6|5\.6|5\.8|8\.8|10\.9|12\.9)\b/);
  if (classe) partes.push(`classe ${classe[1]}`);
  const inox = d.match(/\bAISI ?(\d{3})\b/) || d.match(/\bINOX ?A ?-? ?(304|316)\b/);
  if (inox) partes.push(`AISI ${inox[1]}`);

  const cabeca = /\bSEXT/.test(d) ? "Sextavada" : /\bFRANCES/.test(d) ? "Francês" : /\bOLHAL\b/.test(d) ? "Olhal"
    : /\bCAB(?:ECA)? CHATA\b/.test(d) ? "Chata" : /\bALLEN\b|\bCILINDRIC/.test(d) ? "Allen" : null;
  const acabamento = /\bGF\b|GALV.*FOGO|ZINC(?:ADO)? FOG/.test(d) ? "Galvanizado a fogo"
    : /\bBICRO/.test(d) ? "Bicromatizado"
      : /\bZB\b|\bZINC/.test(d) ? "Zincado"
        : /\bAISI ?3\d\d\b|\bINOX\b/.test(d) ? "Inox"
          : /\bPRETO\b/.test(d) ? "Preto" : null;
  return { norma: partes.length ? partes.join(" · ") : null, diametro, comprimento, cabeca, acabamento };
}

// ─── AS LINHAS DA PLANILHA ───────────────────────────────────────────────────────────────────

const ORDEM_TIPO = ["Perfil W", "Perfil HP", "Perfil I", "Perfil U", "Perfil soldado", "Perfil dobrado", "Perfil",
  "Cantoneira", "Cantoneira dobrada", "Tubo redondo", "Tubo quadrado", "Tubo retangular",
  "Barra redonda", "Barra chata", "Barra quadrada", "Barra sextavada", "Trilho"];
const ordemTipo = (t) => { const i = ORDEM_TIPO.indexOf(t); return i < 0 ? ORDEM_TIPO.length : i; };
const porTexto = (a, b) => a.localeCompare(b, "pt-BR", { numeric: true });

/**
 * @param {Array<{codigo:string, descricao:string, unidade?:string|null, familia?:string|null, inativo?:boolean}>} produtos
 */
export function linhasDaPlanilha(produtos) {
  const perfis = [], parafusos = [];
  const vistos = new Set();
  for (const p of produtos || []) {
    const codigo = String(p?.codigo || "").trim();
    if (!codigo || vistos.has(codigo)) continue;
    const grupo = grupoDoProduto(p);
    if (!grupo) continue;
    vistos.add(codigo);
    const base = { codigo, descricao: String(p.descricao || "").trim(), unidade: p.unidade || null };
    if (grupo === "PERFIL") perfis.push({ ...base, ...lerPerfil(p.descricao) });
    else parafusos.push({ ...base, ...lerParafuso(p.descricao) });
  }
  perfis.sort((a, b) => ordemTipo(a.tipo) - ordemTipo(b.tipo) || porTexto(a.designacao || a.descricao, b.designacao || b.descricao));
  parafusos.sort((a, b) => porTexto(a.descricao, b.descricao));
  return { perfis, parafusos };
}

/** Códigos que estão agora e não estavam na última planilha. Sem planilha anterior: nenhum "novo". */
export function codigosNovos(atuais, anteriores) {
  if (!anteriores) return [];
  return [...new Set(atuais)].filter((c) => !anteriores.has(c));
}

// "2026-09-24 17h05", no horário de Brasília — ordena por nome e não repete no mesmo dia
const fmtCarimbo = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
export function nomeDoArquivo(quando = new Date()) {
  const p = Object.fromEntries(fmtCarimbo.formatToParts(quando).map((x) => [x.type, x.value]));
  return `${PREFIXO_ARQUIVO} ${p.year}-${p.month}-${p.day} ${p.hour}h${p.minute}.xlsx`;
}

// ─── O XLSX ──────────────────────────────────────────────────────────────────────────────────

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
 * @param {{perfis:object[], parafusos:object[], novos?:Set<string>|null, geradoEm?:Date, anterior?:string|null}} op
 *   novos: null = primeira planilha da pasta (não há com o que comparar)
 * @returns {Promise<Buffer>}
 */
export async function gerarPlanilhaMateriaisTekla({ perfis, parafusos, novos = null, geradoEm = new Date(), anterior = null }) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Portal Torg Metal";
  wb.created = geradoEm;

  abaDeDados(wb, "Perfis", COLUNAS_PERFIS, perfis, novos);
  abaDeDados(wb, "Parafusos", COLUNAS_PARAFUSOS, parafusos, novos);

  const wsN = wb.addWorksheet("Novos", { views: [{ state: "frozen", ySplit: 1 }] });
  wsN.columns = [{ header: "Grupo", key: "grupo", width: 11 }, { header: "Código Omie", key: "codigo", width: 14 }, { header: "Descrição (Omie)", key: "descricao", width: 70 }];
  wsN.getColumn(2).numFmt = "@";
  const listaNovos = novos ? [
    ...perfis.filter((l) => novos.has(l.codigo)).map((l) => ({ grupo: "Perfil", codigo: l.codigo, descricao: l.descricao })),
    ...parafusos.filter((l) => novos.has(l.codigo)).map((l) => ({ grupo: "Parafuso", codigo: l.codigo, descricao: l.descricao })),
  ] : [];
  for (const l of listaNovos) wsN.addRow(l);
  if (!novos) wsN.addRow({ grupo: "—", codigo: "", descricao: "Primeira planilha da pasta: não há anterior para comparar." });
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
    ["Novos nesta planilha", novos ? `${listaNovos.length} (aba "Novos"; linhas destacadas nas abas de dados)` : "primeira planilha da pasta"],
    ["Planilha anterior", anterior || "—"],
    ["", ""],
    ["Quando sai uma nova", "O portal confere o cadastro do Omie de segunda a sábado, às 6h30 e às 12h30. Se aparecer um perfil ou parafuso que não está na última planilha desta pasta, gera um ARQUIVO NOVO (data e hora no nome). A planilha mais recente é a que vale."],
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

/** Os códigos que uma planilha já publicada tem (abas Perfis e Parafusos, coluna A). */
export async function codigosDaPlanilha(buffer) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const codigos = new Set();
  for (const nome of ["Perfis", "Parafusos"]) {
    const ws = wb.getWorksheet(nome);
    if (!ws) continue;
    ws.eachRow((row, n) => {
      if (n === 1) return;
      const v = row.getCell(1).value;
      const t = String(v?.text ?? v?.result ?? v ?? "").trim();
      if (t) codigos.add(t);
    });
  }
  return codigos;
}
