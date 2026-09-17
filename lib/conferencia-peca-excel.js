import "server-only";
import { criarRelatorioTorg, adicionarFolhaTorg, adicionarHeaderTabela, adicionarLinhaTabela, adicionarLinhaTotais, bufferWorkbookTorg } from "@/lib/excel-relatorio";
import { rotuloSituacao, SITUACAO } from "./conferencia-relatorio";
import { dataHoraBR } from "./data-br";

// A planilha da conferência — a mesma informação do PDF, no formato que se filtra e se soma.
//
// ⚠ DUAS ABAS, E A SEGUNDA NÃO É ENFEITE: "Peças" responde o que falta; "Lançamentos" responde
// quem contou o quê e quando, que é a pergunta de quando o número não bate.
//
// ⚠ Cor por situação em vez de só texto: numa lista de centenas de marcas, o que falta tem de
// saltar antes de qualquer filtro ser aplicado.
const FUNDO = {
  [SITUACAO.NAO_CONFERIDA]: "FDE8E8",
  [SITUACAO.PARCIAL]: "FFF3E8",
  [SITUACAO.COMPLETA]: undefined,
};

/** A segunda aba. Em função própria para o corpo principal caber no teto de statements. */
async function abaDosLancamentos(workbook, rel, op) {
  // ⚠ `adicionarFolhaTorg` e não `addWorksheet` cru: folha acrescentada direto sai SEM o cabeçalho
  // Torg, e planilha sem cabeçalho não é documento da Torg (lição de 07/09/2026, o caderno do pintor).
  const { sheet: hist, linhaInicio: inicioHist } = await adicionarFolhaTorg(workbook, {
    titulo: `Lançamentos — OP-${op}`,
    subtitulo: `${rel.lancamentos.length} lançamento(s) na conferência`,
    totalColunas: 5,
    nomePlanilha: "Lançamentos",
  });
  hist.columns = [{ width: 20 }, { width: 22 }, { width: 10 }, { width: 26 }, { width: 40 }];
  let lh = inicioHist;
  adicionarHeaderTabela(hist, lh, ["Data / hora", "Marca", "Qtd", "Conferente", "Observação"]);
  lh++;
  for (const l of rel.lancamentos) {
    adicionarLinhaTabela(hist, lh, [dataHoraBR(l.criadoEm), l.marca, l.qte, l.criadoPorNome || "—", l.observacao || "—"], {
      alinhamento: { 2: "right" },
    });
    lh++;
  }

}

/** @returns {Promise<Buffer>} */
export async function gerarConferenciaExcel(rel) {
  const r = rel.resumo;
  const op = String(rel.op.numero ?? "").padStart(3, "0");
  const { workbook, sheet, linhaInicio } = await criarRelatorioTorg({
    titulo: `Conferência de Peça — OP-${op}`,
    subtitulo: [rel.op.obra, rel.op.cliente,
      rel.sessao.finalizadaEm ? `finalizada em ${dataHoraBR(rel.sessao.finalizadaEm)}` : null,
      rel.sessao.finalizadaPorNome ? `por ${rel.sessao.finalizadaPorNome}` : null,
    ].filter(Boolean).join(" · "),
    kpis: [
      `${r.marcas} marca(s) · ${r.previsto} peça(s) previstas · ${r.conferido} conferida(s)`,
      r.percentual === null ? "Sem peça prevista nesta obra" : `${r.percentual}% conferido`,
      // ⚠ O alerta entra como KPI para aparecer ANTES da tabela, como no PDF.
      r.pendente ? `⚠ ATENÇÃO: ${r.saldo} peça(s) NÃO conferida(s) — ${r.naoConferidas} marca(s) sem lançamento, ${r.parciais} parcial(is).` : null,
    ].filter(Boolean),
    totalColunas: 9,
    nomePlanilha: "Peças",
  });

  // ⚠⚠ A MARCA FICA SOZINHA NA COLUNA A, e isso é requisito, não estética. Matheus (17/09/2026):
  // "precisa sair uma coluna somente com as marcas/tags, ou[tra] com descrição, quantidade, peso e
  // observações". O PCP COPIA essa coluna inteira para montar romaneio — marca grudada com
  // descrição ou situação obrigaria a limpar 500 células à mão.
  sheet.columns = [{ width: 22 }, { width: 44 }, { width: 11 }, { width: 12 }, { width: 10 },
    { width: 16 }, { width: 13 }, { width: 14 }, { width: 38 }];
  let linha = linhaInicio;
  adicionarHeaderTabela(sheet, linha, ["Marca", "Descrição", "Previsto", "Conferido", "Saldo",
    "Situação", "Peso unit. (kg)", "Peso conferido (kg)", "Observações"]);
  linha++;
  const primeira = linha;
  for (const l of rel.linhas) {
    // ⚠ A situação continua como TEXTO, além da cor da linha: numa planilha as pessoas filtram e
    // ordenam, e não se filtra por cor de fundo. Cheguei a trocá-la pela cor para caber as colunas
    // novas — seria apagar informação que já existia, em nome de largura.
    adicionarLinhaTabela(sheet, linha, [
      l.marca, l.descricao || "—", l.previsto, l.conferido, l.saldo, rotuloSituacao(l.situacao),
      l.pesoUnitKg || "", l.pesoConferidoKg || "", l.observacoes || "",
    ], {
      fillColor: FUNDO[l.situacao],
      alinhamento: { 2: "right", 3: "right", 4: "right", 5: "center", 6: "right", 7: "right" },
    });
    linha++;
  }
  if (rel.linhas.length) {
    adicionarLinhaTotais(sheet, linha, ["TOTAL", "",
      { formula: `SUM(C${primeira}:C${linha - 1})` },
      { formula: `SUM(D${primeira}:D${linha - 1})` },
      { formula: `SUM(E${primeira}:E${linha - 1})` },
      "", "",
      { formula: `SUM(H${primeira}:H${linha - 1})` }, ""]);
  }

  await abaDosLancamentos(workbook, rel, op);

  return Buffer.from(await bufferWorkbookTorg(workbook));
}
