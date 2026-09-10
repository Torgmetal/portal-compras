import * as XLSX from "xlsx";

// Parser da "LISTA EQUIVALÊNCIA DE MARCAS" — a planilha que o cliente QWS manda junto com a obra,
// e de onde saem os campos que só a ETIQUETA DELE pede (Matheus, 10/09/2026: "um modelo específico
// para um cliente da OP 102, eles pedem informações extras conforme a planilha").
//
// Colunas do arquivo (OP.102): MARCA | QTD | DESCRIÇÃO | REFERENCIA | TAG PETROBRAS |
//                              ÁREA UNIT | ÁREA TOTAL | PESO UNIT | PESO TOTAL | OBSERVAÇÃO
//
// ⚠⚠ SÓ QUATRO COLUNAS SÃO LIDAS, E ISSO É DECISÃO. Quantidade, peso e área JÁ ESTÃO no portal
// (vieram da Lista de Expedição) — reimportá-los daqui criaria uma segunda fonte para o mesmo
// número, e a etiqueta passaria a poder discordar da tela. O que esta planilha tem de exclusivo
// são REFERENCIA e TAG PETROBRAS (códigos do cliente, que o portal não conhece) e a DESCRIÇÃO,
// que aqui é a posição do desenho ("SE-001") e não o perfil ("L2''X1/4''") do cadastro.
//
// ⚠ A MARCA É A CHAVE. Ela é o que liga esta linha à peça já cadastrada — e é o único campo cuja
// ausência descarta a linha.

function normalize(s) {
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

/** Texto de célula limpo: a planilha vem cheia de espaço rígido (\xa0) em volta dos valores. */
const texto = (v) => {
  const s = String(v ?? "").replace(/\u00a0/g, " ").trim();
  return s || null;
};

/**
 * A linha do cabeçalho é a que tem MARCA e TAG PETROBRAS.
 *
 * ⚠ Procurar só por "MARCA" acharia o título da planilha ("LISTA EQUIVALENCIA DE MARCAS") antes
 * do cabeçalho de verdade — e todas as colunas sairiam deslocadas a partir dali.
 */
function acharCabecalho(rows) {
  for (let i = 0; i < Math.min(20, rows.length); i++) {
    const r = rows[i] || [];
    const temMarca = r.some((c) => normalize(c) === "marca");
    const temTag = r.some((c) => normalize(c).includes("tagpetrobras"));
    if (temMarca && temTag) return i;
  }
  return -1;
}

const acharColuna = (cabecalho, testar) => {
  for (let c = 0; c < cabecalho.length; c++) if (testar(normalize(cabecalho[c]))) return c;
  return -1;
};

/**
 * @param {Buffer|ArrayBuffer} buffer
 * @returns {{unidades: Array<{marca:string, unidade:number, descricao:string|null, referencia:string|null, tagPetrobras:string|null}>, marcas:number, ignoradas:number}}
 */
export function parseEquivalenciaMarcas(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error("Planilha vazia");
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: false });

  const iCab = acharCabecalho(rows);
  if (iCab < 0) throw new Error("Não achei o cabeçalho — a planilha precisa ter as colunas MARCA e TAG PETROBRAS.");
  const cab = rows[iCab] || [];

  const cMarca = acharColuna(cab, (n) => n === "marca");
  const cDesc = acharColuna(cab, (n) => n === "descricao");
  const cRef = acharColuna(cab, (n) => n.startsWith("referencia"));
  const cTag = acharColuna(cab, (n) => n.includes("tagpetrobras"));
  if (cMarca < 0) throw new Error("A planilha não tem coluna MARCA.");

  return colher(rows.slice(iCab + 1), { cMarca, cDesc, cRef, cTag });
}

/** Cada linha de dados vira uma UNIDADE, numerada dentro da marca, na ordem da planilha. */
function colher(linhas, { cMarca, cDesc, cRef, cTag }) {
  const unidades = [];
  const contador = new Map();
  let ignoradas = 0;
  for (const r of linhas) {
    const celula = (c) => (c >= 0 ? texto((r || [])[c]) : null);
    const marca = celula(cMarca);
    // Rodapé, linha em branco e "TOTAL.:" caem aqui — a mesma sujeira que o importador da LE já
    // conhece (ver `ehLinhaDeTotal` em lib/itens-expedicao.js).
    if (!marca || /^total/i.test(marca)) { ignoradas++; continue; }
    // ⚠⚠ MARCA REPETIDA É UNIDADE A MAIS, NÃO LINHA DUPLICADA. Matheus (10/09/2026): "quando eu
    // importar uma planilha e uma marca se repetir é porque a REFERENCIA E TAG PETROBRAS são
    // diferentes para cada unidade dessa peça". A T102A15 da OP-102 são 3 peças em 3 linhas, com
    // TAGs HC725-001, HC725-002 e HC726-001 — a etiqueta 2/3 leva a segunda.
    const unidade = (contador.get(marca) || 0) + 1;
    contador.set(marca, unidade);
    unidades.push({
      marca, unidade,
      descricao: celula(cDesc),
      referencia: celula(cRef),
      tagPetrobras: celula(cTag),
    });
  }
  return { unidades, marcas: contador.size, ignoradas };
}
