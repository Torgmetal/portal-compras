// Gera o romaneio no template FORM 22 (o .xlsm original da Torg): preenche só os
// dados da OP/romaneio e devolve um .xlsx com o layout/logo/fórmulas preservados.
// Colunas seguem o template lido pelo parseRomaneio: D=Marca, E=Qte, H=Descrição,
// J=Peso. O peso vai como NÚMERO (não fórmula) — senão o parseRomaneio (que fecha
// o "expedido") leria o texto da fórmula.
import ExcelJS from "exceljs";
import { ROMANEIO_FORM22_B64 } from "@/lib/templates/romaneio-form22.b64";

const LINHA_ITEM = 32; // primeira linha de item no FORM 22
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Código da OP no padrão do romaneio: "096" → "T96".
function codOP(numero) {
  const d = String(numero || "").replace(/\D/g, "").replace(/^0+/, "");
  return d ? `T${d}` : String(numero || "");
}

/**
 * @param {object} p
 * @param {object} p.op   — { numero, cliente, obra, cliente* (endereço/cnpj/ie/cep/contato/email/cidade/uf) }
 * @param {object} p.romaneio — { numero, data, transportadora, contatoTransporte }
 * @param {Array}  p.itens — [{ marca, descricao, qtd, pesoKg, unidade? }]
 * @returns {Promise<Buffer>}
 */
export async function gerarRomaneioForm22({ op, romaneio, itens }) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(ROMANEIO_FORM22_B64, "base64"));
  const ws = wb.worksheets[0];
  const set = (addr, v) => { ws.getCell(addr).value = v === undefined || v === "" ? null : v; };

  // ── Cabeçalho ──
  set("C11", codOP(op?.numero));
  set("J11", romaneio?.numero || null);
  set("E14", op?.clienteRazaoSocial || op?.cliente || null);
  set("J14", op?.obra || null);
  set("E15", [op?.clienteEndereco, op?.clienteCidade, op?.clienteUF].filter(Boolean).join(", ") || null);
  set("J15", op?.clienteCep || null);
  set("E16", op?.clienteContato || null);
  set("J16", op?.clienteCnpj || null);
  set("E17", op?.clienteEmail || null);
  set("J17", op?.clienteIE || null);
  set("E19", "TORG METAL");
  set("J19", romaneio?.data ? new Date(romaneio.data) : new Date());

  // ── Transportador (o FORM 22 não tem motorista/placa; ficam só no portal) ──
  set("E22", romaneio?.transportadora || null);
  set("E24", romaneio?.contatoTransporte || null);

  // ── Itens ──
  const lista = (itens || []).filter((it) => it && it.marca);
  const N = lista.length;

  // O template só traz UMA linha de item estilizada (32, com borda) + a linha de
  // total (33, com fill); as linhas abaixo vêm SEM formatação. Sem copiar o estilo,
  // os itens 2+ saíam sem borda ("desconfigurado"). Captura os estilos-modelo e
  // aplica em cada linha escrita, pra o grid sair uniforme e pronto pra impressão.
  const COLS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
  const estiloItem = {}, estiloTotal = {};
  for (const col of COLS) {
    estiloItem[col] = ws.getCell(`${col}${LINHA_ITEM}`).style;
    estiloTotal[col] = ws.getCell(`${col}${LINHA_ITEM + 1}`).style;
  }

  let soma = 0;
  lista.forEach((it, i) => {
    const r = LINHA_ITEM + i;
    for (const col of COLS) ws.getCell(`${col}${r}`).style = { ...estiloItem[col] };
    const peso = r2(it.pesoKg);
    soma += peso;
    set(`A${r}`, 1);
    set(`B${r}`, 1);                        // Vol. (Carga)
    set(`C${r}`, null);
    set(`D${r}`, String(it.marca).trim());  // Marca
    set(`E${r}`, Number(it.qtd) || 0);      // Qte.
    set(`F${r}`, it.unidade || "PÇ");       // Unid.
    set(`G${r}`, null);
    set(`H${r}`, it.descricao || "");       // Descrição
    set(`I${r}`, null);
    set(`J${r}`, peso);                      // Peso (número)
  });

  // ── Total Geral (com o estilo da linha de total do template) ──
  const rt = LINHA_ITEM + N;
  for (const col of COLS) ws.getCell(`${col}${rt}`).style = { ...estiloTotal[col] };
  set(`A${rt}`, 1);
  set(`B${rt}`, null); set(`C${rt}`, "Total Geral"); set(`D${rt}`, null);
  set(`E${rt}`, null); set(`F${rt}`, null); set(`G${rt}`, null); set(`H${rt}`, null); set(`I${rt}`, null);
  set(`J${rt}`, r2(soma));

  return Buffer.from(await wb.xlsx.writeBuffer());
}
