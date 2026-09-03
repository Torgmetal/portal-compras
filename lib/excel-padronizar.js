// ─── PLANILHA DE FORA, CARA DA CASA ───────────────────────────────────────────
//
// Vitor (03/09/2026): "vou precisar anexar algumas planilhas em excel, nesse caso vc consegue tratar
// elas e dar a nossa cara sem sair aquela porcaria que sai do Tekla?".
//
// O Tekla exporta lista com fonte de sistema, coluna estourada, cabeçalho no meio da folha e o
// nome do arquivo como único título. Sai da nossa mão parecendo saída de máquina — e o cliente lê a
// lista da obra dele nesse formato.
//
// ⚠⚠ ISTO NÃO REESCREVE O CONTEÚDO. Nenhuma célula é recalculada, arredondada ou renomeada: o que
// muda é a moldura (capa Torg, cabeçalho de tabela, larguras, rodapé ISO). Planilha ao cliente é
// documento — mexer no dado dentro dela seria emitir um documento diferente com o mesmo nome.
//
// ⚠ E SÓ CONVERTE O QUE É TABELA. Sem uma linha de cabeçalho reconhecível, devolve null e o
// chamador entrega o arquivo original. Enfeitar o que não é tabela estraga mais do que arruma.
import * as XLSX from "xlsx";

const MAX_LINHAS = 5000;   // planilha maior que isto vai como veio: o ganho não paga o tempo
const MAX_COLS = 20;

// ⚠ o Tekla enche as células de espaço rígido (\u00a0) para "centralizar" no Excel: " VIGA EL.
// +3100 ". Isso não é dado, é diagramação de quem exportou — e é o que faz a coluna parecer
// desalinhada aqui dentro. Tirar espaço da borda não muda o conteúdo; tudo mais fica intacto.
const limpar = (v) => (typeof v === "string" ? v.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim() : v);
const vazia = (l) => !l || l.every((c) => limpar(c) === "" || c === null || c === undefined);
const cheias = (l) => (l || []).filter((c) => limpar(c) !== "" && c !== null && c !== undefined).length;
// linha toda de texto, com duas ou mais células: é cabeçalho (o de cima, ou o do bloco seguinte)
const pareceCabecalho = (l) => {
  const p = (l || []).filter((c) => limpar(c) !== "" && c !== null && c !== undefined);
  return p.length >= 2 && p.every((c) => typeof c === "string");
};

/**
 * @param {Buffer} buf         a planilha original
 * @param {object} ctx         { titulo, subtitulo, codigoDoc }
 * @returns {Promise<Buffer|null>}  null = não deu para tratar; entregue o original
 */
export async function padronizarPlanilha(buf, { titulo, subtitulo, codigoDoc } = {}) {
  let linhas;
  try {
    const wb = XLSX.read(buf, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) return null;
    linhas = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: "" });
  } catch { return null; }

  if (!linhas?.length || linhas.length > MAX_LINHAS) return null;

  // ⚠ o cabeçalho é a primeira linha com pelo menos duas células preenchidas E texto em todas —
  // é o que separa o título solto ("LISTA DE EXPEDIÇÃO") da linha de colunas.
  let iCab = -1;
  for (let i = 0; i < Math.min(linhas.length, 40); i++) {
    if (cheias(linhas[i]) < 2) continue;
    if (pareceCabecalho(linhas[i])) { iCab = i; break; }
  }
  if (iCab < 0) return null;

  // ⚠ o que vem ANTES do cabeçalho não se joga fora: é o cliente, a obra, o nível. Vira subtítulo,
  // porque é exatamente o que a capa da nossa planilha existe para dizer.
  const contexto = linhas.slice(0, iCab)
    .flatMap((l) => (l || []).map(limpar))
    .filter((c) => typeof c === "string" && c.length > 3)
    .slice(0, 4);

  const cab = linhas[iCab].map((c) => String(limpar(c) ?? ""));
  const nCols = Math.min(MAX_COLS, Math.max(...linhas.slice(iCab).map((l) => l.length), cab.length));
  if (nCols < 2) return null;

  const dados = linhas.slice(iCab + 1).filter((l) => !vazia(l));
  if (!dados.length) return null;

  // ⚠ largura por conteúdo, com teto: coluna de descrição estoura a página se seguir o maior texto.
  const largura = [];
  for (let c = 0; c < nCols; c++) {
    let m = String(cab[c] || "").length;
    for (const l of dados) m = Math.max(m, String(limpar(l[c]) ?? "").length);
    largura.push(Math.min(42, Math.max(9, m + 2)));
  }
  // números à direita: coluna é numérica quando a maioria dos valores é número
  const alinhamento = [];
  for (let c = 0; c < nCols; c++) {
    const vals = dados.map((l) => l[c]).filter((v) => v !== "" && v !== null && v !== undefined);
    const nums = vals.filter((v) => typeof v === "number").length;
    alinhamento.push(vals.length && nums / vals.length > 0.6 ? "right" : "left");
  }

  const { criarRelatorioTorg, adicionarHeaderTabela, adicionarLinhaTabela, adicionarRodapeISO } =
    await import("@/lib/excel-relatorio");

  const { workbook, sheet: ws2, linhaInicio } = await criarRelatorioTorg({
    titulo: titulo || "Planilha",
    subtitulo: [subtitulo, ...contexto].filter(Boolean).join(" · "),
    totalColunas: nCols,
    nomePlanilha: "Lista",
    codigoDoc: codigoDoc || "REL-ENG-003",
  });
  ws2.columns = largura.map((w) => ({ width: w }));

  let l = linhaInicio;
  adicionarHeaderTabela(ws2, l, Array.from({ length: nCols }, (_, c) => cab[c] || "")); l++;
  ws2.views = [{ state: "frozen", ySplit: l - 1 }];
  for (const linha of dados) {
    // ⚠⚠ CABEÇALHO DE BLOCO CONTINUA SENDO CABEÇALHO. A lista do Tekla tem dois blocos — as peças e,
    // embaixo, os consumíveis com OUTRAS colunas. Tratar a segunda linha de títulos como dado
    // deixaria "MARCA / QTD. / DESCRIÇÃO" no meio da tabela como se fosse uma peça chamada MARCA.
    const ehSub = pareceCabecalho(linha) && cheias(linha) >= 2;
    adicionarLinhaTabela(ws2, l, Array.from({ length: nCols }, (_, c) => (limpar(linha[c]) ?? "")),
      ehSub ? { bold: true, fillColor: "F0F4F8" } : { alinhamento });
    l++;
  }
  adicionarRodapeISO(ws2, l + 1, nCols);

  const saida = await workbook.xlsx.writeBuffer();
  return Buffer.from(saida);
}
