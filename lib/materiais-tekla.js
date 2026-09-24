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
// Este arquivo é PURO — classificação, leitura da descrição e o que mudou entre duas planilhas. O xlsx
// mora em lib/materiais-tekla-xlsx.js; o que fala com o Omie e com o SharePoint, em
// lib/materiais-tekla-publicar.js.

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

// ─── O QUE MUDOU DESDE A ÚLTIMA PLANILHA ─────────────────────────────────────────────────────
//
// ⚠⚠ ENTRAR NÃO É A ÚNICA MUDANÇA. Vitor (24/09/2026), antes de o Tekla passar a usar as descrições:
// "como podemos ver o que temos duplicado (…) e esses duplicados é possível alterarmos para depois não
// ocorrer conflitos?". A limpeza é INATIVAR o código repetido no Omie — e, quando só código novo gerava
// arquivo, o inativado continuava na última planilha da pasta até alguém cadastrar outro produto: o
// Tekla seguiria enxergando os dois. Por isso sair (inativado, excluído, mudou de família, virou
// "Cópia de…") e ter a descrição corrigida também geram arquivo novo.

const espaco = (t) => String(t ?? "").replace(/\s+/g, " ").trim();

/**
 * @param {Array<{codigo:string, descricao:string}>} linhas perfis e parafusos de agora
 * @param {Map<string, {descricao:string, grupo:string}>|null} anteriores os da última planilha (null: pasta vazia)
 * @returns {{novos:string[], sairam:Array<{codigo:string, descricao:string, grupo:string}>, alterados:Array<{codigo:string, descricao:string, anterior:string}>}}
 */
export function mudancasDoCadastro(linhas, anteriores) {
  if (!anteriores) return { novos: [], sairam: [], alterados: [] };
  const agora = new Map((linhas || []).map((l) => [l.codigo, l.descricao]));
  const novos = [], alterados = [];
  for (const [codigo, descricao] of agora) {
    const antes = anteriores.get(codigo);
    if (!antes) novos.push(codigo);
    // espaço a mais não é mudança de cadastro: o xlsx e o Omie não precisam concordar no branco
    else if (espaco(antes.descricao) !== espaco(descricao)) alterados.push({ codigo, descricao, anterior: antes.descricao });
  }
  const sairam = [...anteriores].filter(([c]) => !agora.has(c)).map(([codigo, a]) => ({ codigo, descricao: a.descricao, grupo: a.grupo }));
  return { novos, sairam, alterados };
}

// "2026-09-24 17h05", no horário de Brasília — ordena por nome e não repete no mesmo dia
const fmtCarimbo = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
export function nomeDoArquivo(quando = new Date()) {
  const p = Object.fromEntries(fmtCarimbo.formatToParts(quando).map((x) => [x.type, x.value]));
  return `${PREFIXO_ARQUIVO} ${p.year}-${p.month}-${p.day} ${p.hour}h${p.minute}.xlsx`;
}

// O xlsx (gerar e ler de volta) mora em lib/materiais-tekla-xlsx.js; reexportado para quem já importa daqui.
export { gerarPlanilhaMateriaisTekla, descricoesDaPlanilha, codigosDaPlanilha } from "./materiais-tekla-xlsx";
