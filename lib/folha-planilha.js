// Parser das planilhas de fechamento de folha (TORG e VMI) para reconciliar com
// o cadastro do portal. Lê os funcionários ATIVOS das abas de folha e enriquece
// com os dados canônicos das abas CADASTRO. Tolerante a layout: acha colunas
// pelo nome do cabeçalho (linha 1) e ignora a linha de totais ("-").
import * as XLSX from "xlsx";

export function normalizar(s) {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}
export function soDigitos(s) {
  return String(s ?? "").replace(/\D/g, "");
}

// Converte célula de data (Date do xlsx, "dd/mm/aaaa", "dd/mmaaaa" ou "aaaa-mm-dd") → "AAAA-MM-DD"
function parseDataISO(val) {
  if (!val) return null;
  if (val instanceof Date && !isNaN(val.getTime())) return val.toISOString().slice(0, 10);
  const s = String(val).trim();
  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-]?(\d{4})$/); // 22/04/1990 ou 29/051978
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

function parseNumero(val) {
  if (val == null || val === "" || val === "-") return null;
  const n = parseFloat(String(val).replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  return isNaN(n) ? null : n;
}

// Mapa header→índice a partir da linha de cabeçalho; get(row, ...termos) acha por substring.
function fazerGetter(headerRow) {
  const norm = headerRow.map(normalizar);
  return (row, ...termos) => {
    for (const t of termos) {
      const alvo = normalizar(t);
      const idx = norm.findIndex((h) => h.includes(alvo));
      if (idx >= 0) {
        const v = row[idx];
        return v == null ? "" : v;
      }
    }
    return "";
  };
}

// Acha a linha de cabeçalho (a que tem "ID" e "NOME") nas primeiras linhas.
function acharHeader(rows) {
  for (let i = 0; i < Math.min(rows.length, 4); i++) {
    const n = rows[i].map(normalizar);
    if (n.includes("ID") && n.some((h) => h.includes("NOME"))) return i;
  }
  return 0;
}

const EH_TOTAL = (id) => { const s = String(id ?? "").trim(); return !s || s === "-"; };

// Uma aba é "folha de ativos" se tem coluna Líquido e não é cadastro/13º/resumo/
// pró-labore/1ª quinzena (o PJ ativo é só a 2ª quinzena).
function ehFolhaAtiva(nome, headerRow) {
  const n = normalizar(nome);
  if (/CADASTRO|13|RESUMO|PRO ?LABORE|PROLABORE/.test(n)) return false;
  if (/1[AªºO]? QUINZENA|1 QUINZENA/.test(n)) return false;
  return headerRow.map(normalizar).some((h) => h === "LIQUIDO");
}
const ehCadastro = (nome) => /CADASTRO/.test(normalizar(nome));

function linhasDe(ws) {
  // raw:true → números viram Number e datas viram Date (cellDates); textos ficam string.
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", blankrows: false, cellDates: true });
}

/**
 * @param {Buffer} buffer xlsx da folha
 * @returns {{ empresaGuess: string|null, registros: Array<object> }}
 */
export function parsePlanilhaFolha(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const nomes = wb.SheetNames;

  // Empresa pelo conjunto de abas
  let empresaGuess = null;
  const todasNorm = nomes.map(normalizar).join("|");
  if (/TORG CLT|CADASTRO CLT/.test(todasNorm)) empresaGuess = "TORG Metal";
  else if (/CADASTRO GERAL|MONTAGEM EXTERNA/.test(todasNorm)) empresaGuess = "VMI";

  // 1) Índice canônico (CADASTRO): por ID e por CPF
  const porId = new Map();
  const porCpf = new Map();
  for (const nome of nomes) {
    if (!ehCadastro(nome)) continue;
    const rows = linhasDe(wb.Sheets[nome]);
    const h = acharHeader(rows);
    const get = fazerGetter(rows[h]);
    for (let i = h + 1; i < rows.length; i++) {
      const row = rows[i];
      const id = String(get(row, "ID")).trim();
      if (EH_TOTAL(id)) continue;
      const cpfCol = get(row, "CPF", "CNPJ");
      const rec = {
        id,
        nome: String(get(row, "Nome")).trim(),
        cpf: soDigitos(cpfCol).length === 11 ? soDigitos(cpfCol) : "",
        cnpj: soDigitos(cpfCol).length === 14 ? soDigitos(cpfCol) : "",
        cargo: String(get(row, "Cargo")).trim(),
        setor: String(get(row, "Setor")).trim(),
        email: String(get(row, "E-mail", "Email")).trim(),
        centroCusto: normalizar(get(row, "Centro de Custo")) || "",
        salario: parseNumero(get(row, "Salário Base", "Valor Contratado", "Salario")),
        dataNascimento: parseDataISO(get(row, "Data Nascimento", "Nascimento")),
        dataAdmissao: parseDataISO(get(row, "Data Admissão", "Admissão", "Data Inicio")),
      };
      if (id) porId.set(id, rec);
      if (rec.cpf) porCpf.set(rec.cpf, rec);
    }
  }

  // 2) Ativos (abas de folha) enriquecidos com o cadastro
  const registros = [];
  const vistos = new Set();
  for (const nome of nomes) {
    const rows = linhasDe(wb.Sheets[nome]);
    if (!rows.length) continue;
    const h = acharHeader(rows);
    if (!ehFolhaAtiva(nome, rows[h])) continue;
    const get = fazerGetter(rows[h]);
    const ehPJ = rows[h].map(normalizar).some((x) => x.includes("CNPJ") || x.includes("VALOR CONTRATADO"));
    for (let i = h + 1; i < rows.length; i++) {
      const row = rows[i];
      const id = String(get(row, "ID")).trim();
      if (EH_TOTAL(id)) continue;
      const docCol = get(row, "CPF", "CNPJ");
      const cpf = soDigitos(docCol).length === 11 ? soDigitos(docCol) : "";
      const cnpj = soDigitos(docCol).length === 14 ? soDigitos(docCol) : "";
      const can = porId.get(id) || (cpf && porCpf.get(cpf)) || {};
      const chave = id || cpf || normalizar(get(row, "Nome"));
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      registros.push({
        empresa: empresaGuess,
        abaFolha: nome,
        id,
        tipoContrato: ehPJ ? "PJ" : "CLT",
        nome: String(get(row, "Nome")).trim() || can.nome || "",
        cpf: cpf || can.cpf || "",
        cnpj: cnpj || can.cnpj || "",
        email: can.email || "",
        cargo: can.cargo || "",
        setor: can.setor || "",
        centroCusto: normalizar(get(row, "Centro de Custo")) || can.centroCusto || "",
        salario: parseNumero(get(row, "Salário Base", "Valor Contratado")) ?? can.salario ?? null,
        dataNascimento: can.dataNascimento || null,
        dataAdmissao: can.dataAdmissao || null,
      });
    }
  }

  return { empresaGuess, registros };
}
