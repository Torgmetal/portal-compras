// Gera o romaneio no template FORM 22 (o .xlsm original da Torg): preenche só os
// dados da OP/romaneio e devolve um .xlsx com o layout/logo/fórmulas preservados.
// Colunas seguem o template lido pelo parseRomaneio: D=Marca, E=Qte, H=Descrição,
// J=Peso. O peso vai como NÚMERO (não fórmula) — senão o parseRomaneio (que fecha
// o "expedido") leria o texto da fórmula.
import ExcelJS from "exceljs";
import { ROMANEIO_FORM22_B64 } from "@/lib/templates/romaneio-form22.b64";
import {adicionarFolhaTorg,adicionarHeaderTabela,adicionarLinhaTabela,bufferWorkbookTorg} from './excel-relatorio';

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
 * @param {Array}  p.itens — [{ marca, descricao, qtd, pesoKg, unidade?, codigo? }]
 * @param {string} [p.rotuloColG] — troca o título da coluna G ("Pos."): no romaneio de MATERIAL
 *   vira "Cód. Omie" (posição não faz sentido ali; o código do cadastro sim).
 * @param {Array}  [p.historico] — [{ revisao, emitidoEm, mudanca, porQuem }] (só nas revisões)
 * @param {string} [p.carimboForm] — troca a identificação do formulário na G7 (o modelo vem com
 *   "(FORM 22 Rev.00)"). O romaneio de TERCEIRO reusa este modelo mas é o FORM 26: sem a troca, o
 *   documento se identificaria como o formulário errado — que é justamente o que a ISO 9001 §7.5.2
 *   pede que ele acerte.
 * @returns {Promise<Buffer>}
 */
export async function gerarRomaneioForm22({ op, romaneio, itens, historico, rotuloColG, carimboForm }) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(ROMANEIO_FORM22_B64, "base64"));
  const ws = wb.worksheets[0];
  const set = (addr, v) => { ws.getCell(addr).value = v === undefined || v === "" ? null : v; };
  const dataEmissao=romaneio?.data?new Date(romaneio.data):new Date();

  // ── Cabeçalho ──
  // ⚠ G7 é a identificação do formulário (a G7:J7 é mesclada; escrever na G7 basta).
  if (carimboForm) set("G7", carimboForm);
  // O template continha uma data fixa de julho/2026 e um CNPJ de transportador
  // de exemplo. Nenhum deles pode viajar como informação real na nova emissão.
  set('B1',dataEmissao);
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
  set("J19", dataEmissao);
  ws.getCell('J19').numFmt='dd/mm/yyyy';

  // ── Transportador ── (o FORM 22 não tem células próprias de motorista/placa;
  // vão junto do contato, que sobra espaço até a coluna FONE.)
  set("E22", romaneio?.transportadora || null);
  set('J23',romaneio?.transportadoraCnpj||null);
  const placas = [romaneio?.placa, romaneio?.placaCarreta].filter(Boolean).join(" / ");
  set("E24", [
    romaneio?.contatoTransporte,
    romaneio?.motorista ? `Mot. ${romaneio.motorista}` : null,
    placas ? `Placa ${placas}` : null,
  ].filter(Boolean).join(" · ") || null);

  // ── Itens ──
  const lista = (itens || []).filter((it) => it && it.marca);
  const N = lista.length;
  if(N>497)throw new Error('O FORM 22 comporta até 497 marcas. Divida a carga em mais de um romaneio para preservar todas as linhas e assinaturas.');

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

  // Romaneio de MATERIAL: "Pos." vira "Cód. Omie" (não afeta o romaneio de peças).
  if (rotuloColG) ws.getCell(`G${LINHA_ITEM - 2}`).value = rotuloColG;

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
    set(`G${r}`, it.codigo || null);   // Pos. — no romaneio de material vira o Cód. Omie
    set(`H${r}`, it.descricao || "");       // Descrição
    set(`I${r}`, null);
    set(`J${r}`, peso);                      // Peso (número)
    for(const col of COLS)ws.getCell(`${col}${r}`).alignment={...ws.getCell(`${col}${r}`).alignment,vertical:'middle',wrapText:true};
    ws.getRow(r).height=Math.max(20,Math.ceil(String(it.descricao||'').length/Math.max(12,ws.getColumn('H').width||30))*12+8);
  });

  // ── Total Geral (com o estilo da linha de total do template) ──
  const rt = LINHA_ITEM + N;
  for (const col of COLS) ws.getCell(`${col}${rt}`).style = { ...estiloTotal[col] };
  set(`A${rt}`, 1);
  set(`B${rt}`, null); set(`C${rt}`, "Total Geral"); set(`D${rt}`, null);
  set(`E${rt}`, null); set(`F${rt}`, null); set(`G${rt}`, null); set(`H${rt}`, null); set(`I${rt}`, null);
  set(`J${rt}`, r2(soma));
  ws.mergeCells(rt,3,rt,9);
  ws.getCell(rt,3).font={name:'Arial',size:10,bold:true,color:{argb:'002945'}};
  ws.getCell(rt,3).alignment={horizontal:'right',vertical:'middle'};

  // ── Impressão ──
  // No template as linhas de item vazias (31–529) são OCULTAS e não há "área de
  // impressão"; é assim que ele imprime compacto em 1 página. O exceljs perde isso
  // ao regravar (linhas voltam visíveis + entram as colunas AA–AI), e o romaneio sai
  // espremido num canto. Reaplica: mostra só itens+total, esconde o resto da faixa
  // de itens e fixa a área de impressão nas colunas do formulário (A–J).
  ws.getRow(31).hidden = true; // subcabeçalho (oculto no template)
  for (let r = LINHA_ITEM; r <= 529; r++) ws.getRow(r).hidden = r > rt; // itens+total visíveis; resto oculto
  // O modelo tem uma segunda área de trabalho a partir da coluna AA. Alguns
  // leitores a incluem no ajuste da largura, mesmo fora da área de impressão,
  // reduzindo o formulário a um quarto da página. Preserva os dados, mas oculta
  // as colunas externas ao formulário entregue (A–J).
  for(let c=11;c<=ws.columnCount;c++)ws.getColumn(c).hidden=true;
  ws.getColumn('A').hidden=true; // marcadores internos de filtro, fora dos dados da carga
  // Fixa a página EXPLICITAMENTE (não confia no que sobrou do template): A4 retrato,
  // ajustar a largura A–J; cargas longas continuam nas páginas seguintes.
  // O template vem com scale=20 — quando o "ajustar à página" é respeitado ele é
  // ignorado, mas alguns leitores o aplicam e imprimem a 20% num canto; zera pra 100.
  ws.pageSetup.paperSize = 9;          // A4
  ws.pageSetup.orientation = "portrait";
  ws.pageSetup.fitToPage = true;
  ws.pageSetup.fitToWidth = 1;
  ws.pageSetup.fitToHeight = 0;
  ws.pageSetup.printTitlesRow = '1:31';
  ws.pageSetup.scale = 100;
  ws.pageSetup.printArea = "A1:J546";

  // ── Aba "Historico" (só nas revisões) — o que mudou a cada revisão ──
  if (Array.isArray(historico) && historico.length) {
    const {sheet:wsH,linhaInicio}=await adicionarFolhaTorg(wb,{titulo:'Histórico de revisões do romaneio',subtitulo:`Romaneio ${romaneio?.numero||''} · OP ${op?.numero||''}`,nomePlanilha:'Historico',totalColunas:4});
    wsH.columns = [{ width: 12 }, { width: 20 }, { width: 60 }, { width: 24 }];
    const fmtDT = (d) => { try { return d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : ""; } catch { return ""; } };
    adicionarHeaderTabela(wsH,linhaInicio,["Revisão", "Emitido em", "O que mudou", "Por"]);
    for (const [i,h] of historico.entries()) {
      adicionarLinhaTabela(wsH,linhaInicio+i+1,[`R${String(h.revisao ?? 0).padStart(2, "0")}`, fmtDT(h.emitidoEm), h.mudanca || "", h.porQuem || ""]);
    }
    wsH.getColumn(3).alignment = { wrapText: true, vertical: "top" };
  }

  return Buffer.from(await bufferWorkbookTorg(wb));
}
