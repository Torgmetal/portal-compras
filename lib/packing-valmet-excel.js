// ─── O PACKING LIST DA VALMET, PREENCHIDO NO PRÓPRIO MODELO ─────────────────────────────────────
//
// Mesma técnica do FOR-081 da TMSA: o arquivo nasce do modelo da Valmet (lib/templates/packing-valmet.b64.js) e só se
// escrevem VALORES nas células que ele já tem. Células (lidas do modelo):
//   B1 projeto (nome) · G1 nº do projeto · I1 Order Txt · M1 Nota Fiscal · O1 data · Q1 nº do embarque
//   B3 bruto · B4 líquido · B5 m³ · B6:B8 C×L×A (só com um volume) · B9 transportadora · B10 placa · B11 motorista
//   G3:G8 fornecedor (Torg) · M3:M8 comprador (entrega) · R3:R8 comprador (faturamento) · M9/M10 supervisor e fone
//   itens da linha 13: B item · C×D×E medidas · F Order Item (= volume) · G descrição · I qtd · J un · L peso total ·
//   M Valmet Code · N TAG · O desenho · P código do material · Q embalagem · R armazenamento
// ⚠⚠ P (Código do material) FICA VAZIA: o comentário da própria Valmet nessa coluna diz "Not Use".
// ⚠ A coluna A (Nr. do Pacote) é a FÓRMULA do modelo (NF + fornecedor), e fica — decisão do Vitor (16/10/2026).
import ExcelJS from "exceljs";
import { PACKING_VALMET_B64 } from "@/lib/templates/packing-valmet.b64";
import { DADOS_TORG } from "@/lib/empresa";

const PRIMEIRA = 13, ULTIMA_MODELO = 506;
const COLS = "BCDEFGIJKLMNOPQR".split("");

export async function gerarPackingValmetExcel(r) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(PACKING_VALMET_B64, "base64"));
  const ws = wb.worksheets[0];
  // ⚠ os comentários do modelo são os nomes de campo da Valmet ("Order no Txt", "Valmet Code", "Not Use"…) e ficam. Mas
  // alguns vêm sem `protection`, e o exceljs quebra ao gravar ("reading 'locked'"): refaz cada um só com o texto.
  ws.eachRow({ includeEmpty: true }, (row) => row.eachCell({ includeEmpty: true }, (cel) => {
    if (cel.note && typeof cel.note === "object") cel.note = { texts: cel.note.texts };
  }));
  const set = (c, val) => { ws.getCell(c).value = val ?? null; };

  set("B1", r.obra); set("G1", r.oc?.projeto || r.instrucao?.projeto); set("I1", r.oc?.orderTxt);
  set("M1", r.nf || null); set("O1", r.data || new Date()); set("Q1", r.numero);
  const t = r.totais || {};
  set("B3", t.kgBruto); set("B4", t.kgLiquido); set("B5", t.m3 || null);
  const [c, l, a] = Array.isArray(t.dims) ? t.dims : [];
  set("B6", c ?? null); set("B7", l ?? null); set("B8", a ?? null);
  set("B9", r.transporte?.transportadora); set("B10", r.transporte?.placa); set("B11", r.transporte?.motorista);

  // endereço curto (sem a sala), como nos romaneios feitos à mão: a célula do modelo é de uma linha
  const torg = [DADOS_TORG.razaoSocial, DADOS_TORG.cnpj, DADOS_TORG.cep, DADOS_TORG.endereco.replace(/,\s*sala.*$/i, ""), `${DADOS_TORG.cidade}/${DADOS_TORG.uf}`, DADOS_TORG.telefone];
  torg.forEach((val, i) => set(`G${3 + i}`, val));
  const cp = r.instrucao?.comprador || {};
  const comprador = [cp.razao, cp.cnpj, cp.cep, cp.endereco, cp.cidadeUf, r.instrucao?.telefone];
  comprador.forEach((val, i) => { if (val) { set(`M${3 + i}`, val); set(`R${3 + i}`, val); } });
  if (r.instrucao?.contato) set("M9", r.instrucao.contato);
  if (r.instrucao?.telefone) set("M10", r.instrucao.telefone);
  // o quadro livre ao lado do supervisor: qual revisão da Lista de Equivalência deu os Valmet Codes
  if (r.revisaoEquivalencia != null) set("P9", `Valmet Code: Lista de Equivalência Torg × Valmet R${String(r.revisaoEquivalencia).padStart(2, "0")}`);

  // ⚠ a coluna L do modelo é fórmula COMPARTILHADA (=IF(I=0,"",K*I), mestre em L35 e L61): gravar o peso por cima do
  // mestre deixa as cópias órfãs e o exceljs recusa salvar. Cada cópia vira a mesma fórmula, explícita, na sua linha.
  // ⚠ e a coluna A (Nr. do Pacote = NF + "-" + fornecedor) leva o RESULTADO já calculado: o PDF imprime o valor guardado,
  // e o do modelo é o de NF vazia ("-"). O Excel recalcula ao abrir; o PDF não tem quem recalcule.
  const pacote = `${r.nf || ""}-${DADOS_TORG.razaoSocial}`;
  for (let row = PRIMEIRA; row <= ULTIMA_MODELO; row++) {
    const cel = ws.getCell(`L${row}`);
    if (cel.value && typeof cel.value === "object" && (cel.value.sharedFormula || cel.value.shareType)) cel.value = { formula: `IF(I${row}=0,"",K${row}*I${row})` };
    const a = ws.getCell(`A${row}`);
    if (a.value && typeof a.value === "object" && (a.value.formula || a.value.sharedFormula)) a.value = { formula: '_xlfn.CONCAT($M$1,"-",$G$3)', result: pacote };
  }

  const linhas = r.linhas || [];
  const ultima = Math.max(PRIMEIRA, PRIMEIRA + linhas.length - 1);
  if (ultima > ULTIMA_MODELO) ws.duplicateRow(ULTIMA_MODELO, ultima - ULTIMA_MODELO, true);
  // ⚠ o modelo traz a fonte VERMELHA só em L15 (resto de formatação dele): toda linha de peso usa a fonte da L13
  const fonteL = { ...(ws.getCell(`L${PRIMEIRA}`).font || {}) };
  linhas.forEach((ln, i) => {
    const row = PRIMEIRA + i;
    ws.getCell(`L${row}`).font = fonteL;
    const [lc, ll, la] = Array.isArray(ln.dims) ? ln.dims : [];
    const val = { B: ln.item, C: lc, D: ll, E: la, F: ln.volume, G: ln.descricao, I: ln.qtd, J: "pç", K: null, L: ln.pesoKg, M: ln.valmetCode, N: ln.tag, O: null, P: null, Q: ln.tipo, R: ln.armazenamento };
    for (const col of COLS) set(`${col}${row}`, val[col] ?? null);
  });
  ws.pageSetup.printArea = `A1:R${ultima}`;
  return Buffer.from(await wb.xlsx.writeBuffer());
}
