// ─── EXTRATO EM EXCEL DA ABA "PEDIDOS E FATURAMENTO" ──────────────────────────
// Vitor (16/09/2026): "o Excel, isso sim faz sentido". Duas folhas no padrão das planilhas da Torg
// (lib/excel-relatorio, ISO 9001 + logo): "Pedidos" (uma linha por pedido do cliente, com contratado,
// faturado, a faturar, próxima nota e situação) e "Notas" (uma linha por nota emitida). É o extrato
// que o financeiro do cliente concilia com o dele — por isso o número da NF e a data de emissão.
import "server-only";
import { criarRelatorioTorg, adicionarFolhaTorg, adicionarHeaderTabela, adicionarLinhaTabela, adicionarLinhaTotais, bufferWorkbookTorg } from "./excel-relatorio";
import { rotuloComCodigo } from "./cliente-faturamento";

// ⚠ data como DATA (meio-dia UTC, sem virar a véspera no fuso) e formatada pela célula — texto "dd/mm/aaaa"
// o Excel não ordena nem filtra
const dataCel = (iso) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? new Date(`${iso.slice(0, 10)}T12:00:00Z`) : "");
const FMT_DATA = "dd/mm/yyyy";
const ROTULO = { FATURADO: "Faturado", PARCIAL: "Faturado em parte", VENCIDO: "Saldo vencido", AGUARDANDO: "Aguardando faturamento", CANCELADO: "Cancelado", SEM_OMIE: "Sem pedido ainda" };
const moeda = '"R$" #,##0.00';

/**
 * @param {{ email:string, obras:Array, totais:object, sincronizadoEm:string|null }} dados saída de faturamentoDoCliente
 * @param {{ cliente?:string }} [opts]
 * @returns {Promise<Buffer>}
 */
export async function extratoFaturamentoExcel(dados, { cliente = null } = {}) {
  const obras = dados.obras || [];
  const nomeCliente = cliente || obras[0]?.cliente || "";
  const sync = dados.sincronizadoEm ? new Date(dados.sincronizadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";
  const t = dados.totais || { pedidos: 0, contratado: 0, faturado: 0, aFaturar: 0, vencido: 0 };
  const fmt = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  // ── folha 1: pedidos ──
  const cab1 = ["OP", "Obra", "Referências do cliente", "Pedido (OC)", "Aditivo", "Descrição", "Itens / TAGs", "Contratado", "Faturado", "A faturar", "Próxima nota", "Situação", "Pedido Torg nº", "Observação"];
  const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
    titulo: "PEDIDOS DE COMPRA × FATURAMENTO",
    subtitulo: `${nomeCliente} — extrato dos pedidos e notas emitidas pela Torg Metal`,
    kpis: [
      `${t.pedidos} pedido(s) em ${obras.length} obra(s)  |  contratado ${fmt(t.contratado)}  |  faturado ${fmt(t.faturado)}  |  a faturar ${fmt(t.aFaturar)}${t.vencido > 0 ? `  |  saldo vencido ${fmt(t.vencido)}` : ""}`,
      `Sincronizado com o ERP da Torg em ${sync}  |  contato: ${dados.email || "—"}`,
    ],
    totalColunas: cab1.length, nomePlanilha: "Pedidos", codigoDoc: `EXTRATO-${String(nomeCliente).replace(/\s+/g, "-").slice(0, 20).toUpperCase() || "CLIENTE"}`,
  });
  ws.columns = [{ width: 8 }, { width: 22 }, { width: 28 }, { width: 16 }, { width: 8 }, { width: 34 }, { width: 24 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 13 }, { width: 20 }, { width: 13 }, { width: 44 }];
  let row = linhaInicio;
  adicionarHeaderTabela(ws, row, cab1); row++;
  for (const o of obras) {
    const id = o.identificacao || {};
    const refs = [...(id.projetos || []), ...(id.outros || [])].map((r) => `${r.rotulo} ${r.codigo}`);
    if (id.texto && !refs.length) refs.push(id.texto);
    for (const l of o.linhas) {
      adicionarLinhaTabela(ws, row, [
        `OP-${o.opNumero}`, o.obra || "", refs.join(" · "),
        l.oc ? rotuloComCodigo(l.rotulo, l.oc) : "OC não informada", l.aditivo != null ? `Aditivo ${l.aditivo}` : "",
        l.descricao || "", [...(l.itens || []), ...(l.tags || [])].join(", "),
        l.contratado ?? 0, l.faturado || 0, l.aFaturar || 0,
        l.aFaturar > 0 ? dataCel(l.vencidaDesde || l.proximaPrevisao) : "", ROTULO[l.situacao?.codigo] || l.situacao?.rotulo || "",
        (l.pedidosOmie || []).map((p) => p.numero).join(", "), (l.avisos || []).join(" "),
      ], { alinhamento: { 7: "right", 8: "right", 9: "right", 10: "center" }, wrapText: true });
      for (const c of [8, 9, 10]) ws.getCell(row, c).numFmt = moeda;
      ws.getCell(row, 11).numFmt = FMT_DATA;
      if (l.situacao?.codigo === "VENCIDO") ws.getCell(row, 12).font = { name: "Arial", size: 10, bold: true, color: { argb: "B42318" } };
      row++;
    }
  }
  adicionarLinhaTotais(ws, row, ["TOTAL", "", "", `${t.pedidos} pedido(s)`, "", "", "", t.contratado, t.faturado, t.aFaturar, "", t.vencido > 0 ? `vencido ${fmt(t.vencido)}` : "", "", ""]);
  for (const c of [8, 9, 10]) ws.getCell(row, c).numFmt = moeda;

  // ── folha 2: notas, AGRUPADAS POR OC ──
  // Vitor (16/09/2026): "a forma de ver as NF não está separado por OC — isso é mais importante para
  // eles do que para nós". O financeiro do cliente concilia por pedido: um cabeçalho por OC, as notas
  // dela embaixo, subtotal e saldo. Uma lista cronológica misturava obras e pedidos.
  const totalNotas = obras.reduce((s, o) => s + o.linhas.reduce((x, l) => x + (l.notas || []).length, 0), 0);
  const cab2 = ["NF nº", "Série", "Emissão", "Valor", "Pedido Torg nº", "Chave de acesso"];
  const { sheet: ws2, linhaInicio: ini2 } = await adicionarFolhaTorg(workbook, {
    titulo: "NOTAS FISCAIS POR PEDIDO (OC)",
    subtitulo: `${nomeCliente} — ${totalNotas} nota(s) · total ${fmt(t.faturado)}`,
    kpis: [`Sincronizado com o ERP da Torg em ${sync}`],
    totalColunas: cab2.length, nomePlanilha: "Notas por OC", codigoDoc: `NOTAS-${String(nomeCliente).replace(/\s+/g, "-").slice(0, 20).toUpperCase() || "CLIENTE"}`,
  });
  ws2.columns = [{ width: 12 }, { width: 7 }, { width: 13 }, { width: 17 }, { width: 15 }, { width: 50 }];
  let r2 = ini2;
  for (const o of obras) {
    for (const l of o.linhas) {
      const oc = l.oc ? rotuloComCodigo(l.rotulo, l.oc) : "OC não informada";
      // cabeçalho do pedido: quem é, quanto vale, quanto já saiu
      adicionarLinhaTabela(ws2, r2, [`OP-${o.opNumero} · ${o.obra || ""} — ${oc}${l.aditivo != null ? ` (aditivo ${l.aditivo})` : ""}`, "", "", "", "", `${l.descricao || ""}${(l.itens || []).length || (l.tags || []).length ? " · " + [...(l.itens || []), ...(l.tags || [])].join(", ") : ""}`], { fillColor: "E8F2F9", fontSize: 10, wrapText: true });
      ws2.mergeCells(r2, 1, r2, 5); ws2.getCell(r2, 1).font = { name: "Arial", size: 10, bold: true, color: { argb: "0D1F3C" } }; r2++;
      adicionarLinhaTabela(ws2, r2, ["", "", "contratado", l.contratado ?? 0, "faturado", l.faturado || 0], { fontSize: 9 });
      ws2.getCell(r2, 4).numFmt = moeda; ws2.getCell(r2, 6).numFmt = moeda; ws2.getCell(r2, 6).alignment = { horizontal: "left" }; r2++;
      adicionarHeaderTabela(ws2, r2, cab2); r2++;
      const notas = [...(l.notas || [])].sort((x, y) => String(x.data || "").localeCompare(String(y.data || "")));
      if (!notas.length) {
        adicionarLinhaTabela(ws2, r2, ["—", "", "", "", "", l.situacao?.codigo === "VENCIDO" ? "nenhuma nota emitida — previsão vencida" : "nenhuma nota emitida ainda"], { fontSize: 9 }); r2++;
      }
      for (const n of notas) {
        adicionarLinhaTabela(ws2, r2, [n.numero || "a confirmar", n.serie || "", dataCel(n.data), n.valor || 0, n.pedido || "", n.chave || ""], { alinhamento: { 3: "right", 2: "center" } });
        ws2.getCell(r2, 3).numFmt = FMT_DATA; ws2.getCell(r2, 4).numFmt = moeda; r2++;
      }
      adicionarLinhaTotais(ws2, r2, [`Subtotal ${oc}`, "", `${notas.length} nota(s)`, l.faturado || 0, "", l.aFaturar > 0 ? `saldo a faturar ${fmt(l.aFaturar)}${l.situacao?.codigo === "VENCIDO" ? " (vencido)" : ""}` : "pedido faturado por completo"]);
      ws2.getCell(r2, 4).numFmt = moeda; ws2.getCell(r2, 6).alignment = { horizontal: "left" }; r2 += 2;
    }
  }
  adicionarLinhaTotais(ws2, r2, ["TOTAL GERAL", "", `${totalNotas} nota(s)`, t.faturado, "", `a faturar ${fmt(t.aFaturar)}`]);
  ws2.getCell(r2, 4).numFmt = moeda; ws2.getCell(r2, 6).alignment = { horizontal: "left" };

  return Buffer.from(await bufferWorkbookTorg(workbook));
}
