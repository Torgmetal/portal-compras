import * as XLSX from "xlsx";

// ─── A "LISTA DE EQUIVALÊNCIA DE TAG" DO TMSA ────────────────────────────────
//
// Matheus (14/09/2026): *"o excel tem 3 abas e cada ABA tem uma TAG na última coluna e suas marcas;
// essas TAGs têm que sair na frente da descrição de cada MARCA"*.
//
// Colunas (OP-105): ITEM | MARCA | QTD. | DESCRIÇÃO | ÁREA UNIT | ÁREA TOTAL | PESO UNIT |
//                   PESO TOTAL | TAG
//
// ⚠⚠ A TAG É DA PEÇA, NÃO DA MARCA — e isto é o coração do arquivo. Medido na OP-105: 51 das 96
// marcas aparecem em MAIS DE UMA aba, e as quantidades por aba SOMAM exatamente a quantidade da
// Lista de Expedição, nas 96. Das 4 peças da `105A3`, duas vão para o TC 4706 e duas para o TC
// 4707. Lido como "uma TAG por marca", o arquivo faria a última aba apagar a anterior e metade da
// obra sairia com o destino errado.
//
// ⚠⚠ SÓ MARCA, QUANTIDADE E TAG SÃO LIDAS. Descrição, peso e área já vêm da Lista de Expedição —
// reimportá-los daqui criaria uma segunda fonte para o mesmo número e a etiqueta passaria a poder
// discordar da tela. Mesma decisão do parser do QWS.
//
// ⚠ O RODAPÉ "TOTAL.:" É UMA LINHA DE TOTAL, não uma marca. Já virou marca no banco uma vez, em 4
// obras, e dava para mandar imprimir 8.705 etiquetas de uma peça que não existe.

const semAcento = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const chave = (s) => semAcento(s).toLowerCase().replace(/[^a-z0-9]/g, "");

/** Texto de célula limpo: a planilha vem cheia de espaço rígido (\xa0) e de sobra nas pontas. */
const texto = (v) => {
  const s = String(v ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
  return s || null;
};

const ehTotal = (marca) => /^\s*(TOTAL|SUBTOTAL|SOMA)\b/i.test(String(marca ?? ""));

/**
 * A linha de cabeçalho é a que tem MARCA **e** TAG.
 *
 * ⚠ Procurar só por "MARCA" acharia o título da planilha ("LISTA DE EQUIVALÊNCIA DE TAG TORG ↔
 * TMSA") antes do cabeçalho de verdade, e todas as colunas sairiam deslocadas dali para baixo.
 */
function acharCabecalho(linhas) {
  for (let i = 0; i < Math.min(25, linhas.length); i++) {
    const r = linhas[i] || [];
    const temMarca = r.some((c) => chave(c) === "marca");
    const temTag = r.some((c) => chave(c) === "tag");
    if (temMarca && temTag) return i;
  }
  return -1;
}

const acharColuna = (cab, casa) => cab.findIndex((c) => casa(chave(c)));

/** Lê UMA aba para dentro de `porMarca`. Separada do corpo só para caber no teto de complexidade. */
function lerAba(wb, nome, porMarca, problemas) {
  const linhas = XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, defval: null, raw: false, blankrows: false });
  const iCab = acharCabecalho(linhas);
  if (iCab < 0) return { aba: nome, ignorada: true, motivo: "sem cabeçalho MARCA + TAG" };

  const cab = linhas[iCab];
  const cMarca = acharColuna(cab, (k) => k === "marca");
  const cQtd = acharColuna(cab, (k) => k.startsWith("qtd") || k.startsWith("qte") || k === "quantidade");
  const cTag = acharColuna(cab, (k) => k === "tag");

  let marcas = 0, pecas = 0;
  for (const l of linhas.slice(iCab + 1)) {
    const marca = texto(l[cMarca]);
    if (!marca || ehTotal(marca)) continue;
    const tag = texto(l[cTag]);
    const qtd = Math.trunc(Number(String(l[cQtd] ?? "").replace(",", ".")) || 0);
    if (!tag) { problemas.push(`${nome}: ${marca} sem TAG`); continue; }
    // ⚠ Quantidade zero ou negativa não vira unidade nenhuma — e é avisada, não engolida: uma linha
    // assim quer dizer que a planilha está errada, não que a marca não tem destino.
    if (qtd <= 0) { problemas.push(`${nome}: ${marca} com quantidade "${texto(l[cQtd]) ?? "vazia"}"`); continue; }
    if (!porMarca.has(marca)) porMarca.set(marca, []);
    porMarca.get(marca).push({ tag, qtd, aba: nome });
    marcas++; pecas += qtd;
  }
  return { aba: nome, marcas, pecas };
}

/**
 * Lê a planilha inteira e devolve UMA LINHA POR UNIDADE.
 *
 * ⚠⚠ A ALOCAÇÃO UNIDADE→TAG É UMA DISTRIBUIÇÃO, NÃO UMA IDENTIDADE (e o Codex pediu que isso
 * ficasse escrito). A planilha diz "2 peças para o 4706 e 2 para o 4707" — não diz QUAL peça. As
 * unidades saem na ordem das abas, o que produz a CONTAGEM certa por destino; quem cola é quem
 * atribui o destino àquela peça. Só falha se as peças da mesma marca não forem intercambiáveis, e
 * nesse caso o arquivo não teria como resolver.
 *
 * @param {Buffer} buffer
 * @returns {{ok:boolean, erro?:string, unidades?:{marca:string,unidade:number,tag:string}[],
 *            porMarca?:Map<string,{tag:string,qtd:number}[]>, abas?:object[], tags?:string[]}}
 */
export function parseEquivalenciaTag(buffer) {
  let wb;
  try { wb = XLSX.read(buffer, { type: "buffer", cellDates: true }); }
  catch (e) { return { ok: false, erro: `Não consegui abrir a planilha: ${e.message}` }; }

  const porMarca = new Map();
  const abas = [];
  const problemas = [];

  for (const nome of wb.SheetNames) abas.push(lerAba(wb, nome, porMarca, problemas));

  if (!porMarca.size) {
    return { ok: false, erro: "Nenhuma marca com TAG encontrada. Confira se a planilha tem as colunas MARCA e TAG.", abas, problemas };
  }

  // A expansão: cada (marca, tag, qtd) vira `qtd` unidades, numeradas de 1 na ordem das abas.
  const unidades = [];
  for (const [marca, ocorrencias] of porMarca) {
    let unidade = 0;
    for (const o of ocorrencias) {
      for (let i = 0; i < o.qtd; i++) unidades.push({ marca, unidade: ++unidade, tag: o.tag });
    }
  }

  const tags = [...new Set(unidades.map((u) => u.tag))];
  return { ok: true, unidades, porMarca, abas, tags, problemas };
}
