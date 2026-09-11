import {bufferWorkbookTorg} from "@/lib/excel-refinamento";
import "server-only";
import { prisma } from "./prisma";

// ─── A LISTA DA ENGENHARIA NO PADRÃO DA CASA ──────────────────────────────────
// Vitor (30/08/2026): "no caso da engenharia seria bom, pois aí vc vai salvar no padrão que
// definimos no portal — a que está na pasta da engenharia é a lista que exportamos do Tekla, sem
// formatação".
//
// O que o portal já arquivava na pasta da OP é o ARQUIVO CRU DO TEKLA: serve de fonte, não de
// documento. O FORM 21 (Lista Geral do Projeto) é a lista formatada, com cabeçalho ISO, código e
// carimbo do formulário — e essa não existia em lugar nenhum fora da tela.
//
// ⚠ AS DUAS FICAM, e não é redundância: o Tekla cru é a ENTRADA (dá para reimportar, conferir o que
// a Engenharia mandou) e a formatada é o REGISTRO (é ela que o auditor lê). Guardar só a formatada
// perderia a fonte; guardar só a crua deixa o formulário sem evidência.
//
// ⚠⚠ LE E LPC NUNCA SE SOMAM. São duas listas com propósitos diferentes — LE é expedição, LPC é
// fabricação — e a mesma marca aparece nas duas. Por isso cada uma é gerada e arquivada à parte,
// sempre filtrando por `naLE`/`naLPC`. Uma mesma marca pode pertencer às duas.

const nn = (v) => String(v ?? "").replace(/\D/g, "").padStart(3, "0");

const CONFIG = {
  LE: {
    titulo: "Lista Geral do Projeto (LE)",
    nomePlanilha: "LE",
    codigoDoc: "REL-ENG-003",
    form: 21, // Lista Geral do Projeto — o formulário do SGQ
    campo: "naLE",
    pasta: "Listas LE",
  },
  LPC: {
    titulo: "Lista de Peças (LPC)",
    nomePlanilha: "LPC",
    codigoDoc: "REL-ENG-002",
    form: null, // a LPC não tem formulário no índice mestre — está na lista dos a criar
    campo: "naLPC",
    pasta: "Listas LPC",
  },
};

const HEADERS = ["Item", "Marca", "Descrição", "Perfil / material", "Qtd", "Peso unit. (kg)", "Peso total (kg)"];

/**
 * Monta a lista formatada da OP, no padrão das planilhas da Torg.
 *
 * @param {{tipo: "LE"|"LPC", opId: string, opNumero?: string}} p
 * @returns {Promise<{buffer: Buffer, nomeArquivo: string, pasta: string, pecas: number}|null>}
 *   `null` quando a OP não tem peças dessa lista — não se arquiva planilha vazia.
 */
export async function gerarListaEngFormatada({ tipo, opId, opNumero }) {
  const cfg = CONFIG[tipo];
  if (!cfg || !opId) return null;

  const [op, pecas] = await Promise.all([
    prisma.oP.findUnique({ where: { id: opId }, select: { numero: true, obra: true, cliente: true, refCliente: true } }),
    prisma.pecaConjunto.findMany({
      where: { opId, [cfg.campo]: true },
      select: { item: true, marca: true, descricao: true, perfil: true, material: true,
                qte: true, pesoUnitKg: true, pesoTotalKg: true, tipoPeca: true },
      orderBy: [{ item: "asc" }, { marca: "asc" }],
    }),
  ]);
  if (!pecas.length) return null;

  const num = op?.numero || opNumero;
  const { criarRelatorioTorg, adicionarHeaderTabela, adicionarLinhaTabela, adicionarLinhaTotais } =
    await import("./excel-relatorio");

  // As marcas já foram filtradas pela presença na lista. Na LPC, croquis são
  // detalhes de conjuntos; na LE, todas as marcas selecionadas entram no total.
  const pesoTotal = Math.round(pecas
    .filter((p) => tipo === "LE" || p.tipoPeca !== "CROQUI")
    .reduce((soma, p) => soma + (Number(p.pesoTotalKg) || 0), 0) * 100) / 100;

  const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
    titulo: `${cfg.titulo} — OP-${nn(num)}`,
    subtitulo: [op?.obra, op?.cliente, op?.refCliente ? `Ref. ${op.refCliente}` : null].filter(Boolean).join(" · "),
    kpis: [`${pecas.length} itens`, `${pesoTotal.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg`],
    totalColunas: HEADERS.length,
    nomePlanilha: cfg.nomePlanilha,
    codigoDoc: cfg.codigoDoc,
    ...(cfg.form ? { form: cfg.form } : {}),
  });

  ws.columns = [{ width: 8 }, { width: 20 }, { width: 40 }, { width: 26 }, { width: 8 }, { width: 15 }, { width: 15 }];
  let row = linhaInicio;
  adicionarHeaderTabela(ws, row, HEADERS); row++;
  const primeira = row;
  for (const p of pecas) {
    adicionarLinhaTabela(ws, row, [
      p.item ?? "",
      p.marca,
      p.descricao || "",
      [p.perfil, p.material].filter(Boolean).join(" · "),
      p.qte ?? "",
      Number((p.pesoUnitKg || 0).toFixed(2)),
      Number((p.pesoTotalKg || 0).toFixed(2)),
    ], { alinhamento: { 0: "center", 4: "center", 5: "right", 6: "right" } });
    row++;
  }
  // ⚠ o total da coluna é a SOMA DA COLUNA, para a planilha fechar com ela mesma. O peso real da OP
  // (sem dobrar croqui) já foi para o KPI do cabeçalho — os dois números medem coisas diferentes e
  // misturá-los faria a planilha parecer errada para quem confere na mão.
  if (pecas.length) {
    adicionarLinhaTotais(ws, row, ["TOTAL", "", "", "", "", "", { formula: `SUM(G${primeira}:G${row - 1})` }]);
  }

  const buffer = Buffer.from(await bufferWorkbookTorg(workbook));
  return {
    buffer,
    nomeArquivo: `${tipo}_OP-${nn(num)}_${new Date().toISOString().slice(0, 10)}.xlsx`,
    pasta: `/Engenharia/Workspace/${cfg.pasta}/OP-${nn(num)}`,
    pecas: pecas.length,
  };
}
