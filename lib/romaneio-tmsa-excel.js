// ─── O FOR-081 DA TMSA, PREENCHIDO NO PRÓPRIO MODELO ────────────────────────────────────────────
//
// Vitor (15/10/2026): "sobre o layout devemos seguir exatamente esse mesmo modelo que anexei, não podemos mudar nada; no
// campo livre para fornecedor colocar nossos dados". Por isso o arquivo nasce do modelo dela (lib/templates/
// romaneio-tmsa-for081.b64.js) e só se escrevem VALORES nas células que ele já tem — a mesma técnica do FORM 22.
//
// Células (lidas do modelo): A1 "ROMANEIO Nº" · I1 campo livre · I2 data do embarque · M2 peso líquido total ·
// M5 peso bruto total · N2 referência de projeto · N5 total de embalagens · C5 observações · itens a partir da linha 9:
// A identificação · B tipo · C×E×G dimensões (D e F são os "x") · H líquido · I bruto · J TAG · K quantidade ·
// L código · M:O descrição (mesclada). O modelo tem 16 linhas de item (9–24); passando disso, as linhas novas copiam a 24.
import ExcelJS from "exceljs";
import { ROMANEIO_TMSA_FOR081_B64 } from "@/lib/templates/romaneio-tmsa-for081.b64";
import { DADOS_TORG } from "@/lib/empresa";

const PRIMEIRA = 9, ULTIMA_MODELO = 24;
const COLS_EMBALAGEM = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];

/* ⚠ OS DADOS DA TORG EM TRÊS LINHAS DO PRÓPRIO QUADRO (I1, I3, I4), em volta da data do embarque que o modelo já põe
   em I2. Numa linha só, a 18 pt do modelo, o texto invadia a coluna do peso — e mesclar para quebrar linha seria mexer
   no layout, que o Vitor pediu para não tocar. */
export const camposLivresTorg = () => [
  `${DADOS_TORG.razaoSocial} · CNPJ ${DADOS_TORG.cnpj}`,
  `${DADOS_TORG.endereco} · ${DADOS_TORG.cidade}/${DADOS_TORG.uf}`,
  `Tel. ${DADOS_TORG.telefone} · ${DADOS_TORG.email}`,
];

const dataBr = (d) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);

/**
 * @param {{ numero:number, data:Date, referencia:string, observacoes?:string,
 *           totais:{kgLiquido:number,kgBruto:number,embalagens:number}, embalagens:object[] }} r  (lib/romaneio-tmsa.js)
 * @returns {Promise<Buffer>}
 */
export async function gerarRomaneioTmsaExcel(r) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(ROMANEIO_TMSA_FOR081_B64, "base64"));
  const ws = wb.worksheets[0];

  ws.getCell("A1").value = `ROMANEIO Nº ${r.numero}`;
  const [torg1, torg2, torg3] = camposLivresTorg();
  ws.getCell("I1").value = torg1;
  ws.getCell("I3").value = torg2;
  ws.getCell("I4").value = torg3;
  ws.getCell("I2").value = `Data do embarque: ${dataBr(r.data || new Date())}`;
  ws.getCell("M2").value = r.totais.kgLiquido;
  ws.getCell("M5").value = r.totais.kgBruto;
  ws.getCell("N2").value = r.referencia;
  ws.getCell("N5").value = r.totais.embalagens;
  if (r.observacoes) ws.getCell("C5").value = r.observacoes;

  const nLinhas = r.embalagens.reduce((s, e) => s + Math.max(1, e.linhas.length), 0);
  const ultima = Math.max(ULTIMA_MODELO, PRIMEIRA + nLinhas - 1);
  // ⚠ linhas além das 16 do modelo: cópia da última (estilo, altura) e a descrição mesclada M:O como nas dele
  if (ultima > ULTIMA_MODELO) {
    ws.duplicateRow(ULTIMA_MODELO, ultima - ULTIMA_MODELO, true);
    for (let l = ULTIMA_MODELO + 1; l <= ultima; l++) ws.mergeCells(`M${l}:O${l}`);
  }
  // o modelo vem com 1…16 na coluna A: a identificação passa a ser a do volume
  for (let l = PRIMEIRA; l <= ultima; l++) ws.getCell(`A${l}`).value = null;

  let l = PRIMEIRA;
  for (const e of r.embalagens) {
    const linhas = e.linhas.length ? e.linhas : [{ tag: null, qtd: null, codigo: null, descricao: null }];
    const [c, lg, a] = Array.isArray(e.dims) ? e.dims : [null, null, null];
    const valores = { A: e.numero, B: e.tipo, C: c, D: e.dims ? "x" : null, E: lg, F: e.dims ? "x" : null, G: a, H: e.kgLiquido, I: e.kgBruto };
    for (const col of COLS_EMBALAGEM) ws.getCell(`${col}${l}`).value = valores[col] ?? null;
    linhas.forEach((ln, i) => {
      ws.getCell(`J${l + i}`).value = ln.tag || null;
      ws.getCell(`K${l + i}`).value = ln.qtd ?? null;
      ws.getCell(`L${l + i}`).value = ln.codigo || null;
      ws.getCell(`M${l + i}`).value = ln.descricao || null;
    });
    // um volume com várias TAGs: os dados da embalagem valem para todas as linhas dele
    if (linhas.length > 1) for (const col of COLS_EMBALAGEM) ws.mergeCells(`${col}${l}:${col}${l + linhas.length - 1}`);
    l += linhas.length;
  }
  ws.pageSetup.printArea = `A1:O${ultima}`;
  return Buffer.from(await wb.xlsx.writeBuffer());
}
