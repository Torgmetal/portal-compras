"use client";
import { criarRelatorioTorg, adicionarHeaderTabela, adicionarLinhaTabela, adicionarLinhaTotais, downloadWorkbook } from "@/lib/excel-relatorio";

/* PLANILHA "BAIXA SYNECO" — a lista para lançar a baixa NO SYNECO.
 *
 * ⚠⚠ Ideia do Vitor (08/09/2026): "criar um botão ao lado do reimprimir, Baixa Syneco: será
 * exportada uma planilha para poder dar baixa no Syneco das marcas selecionadas". É melhor do que
 * baixar dentro do portal — lançando no Syneco, o número volta pelo sync e o quadro, o cronograma,
 * o PDF e o portal do cliente passam a ver o MESMO. Baixa gravada só aqui criaria uma segunda
 * verdade, e já existe esse caso: 3.709 peças baixadas em agosto que o Gantt nem enxerga.
 *
 * ⚠ A planilha NÃO dá baixa. Ela é o papel de quem vai lançar.
 */
const nb = (v, d = 0) => (v == null ? "" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }));

export async function baixarPlanilhaBaixaSyneco(opNumero, setor, ids, fracoes) {
  const qs = new URLSearchParams({ op: opNumero, setor });
  if (ids?.length) qs.set("ids", ids.join(","));
  if (fracoes !== undefined) qs.set("fracoes", JSON.stringify(fracoes));
  const res = await fetch(`/api/pcp/baixa-syneco?${qs}`, { cache: "no-store" });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error || "Falha ao montar a lista de baixa");

  const t = d.total;
  const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
    titulo: "Baixa no Syneco",
    subtitulo: `OP-${d.op.numero} · ${d.op.obra || ""}${d.op.cliente ? ` · ${d.op.cliente}` : ""} · setor ${d.setorSyneco}`,
    kpis: [
      `Obra(s) no Syneco: ${d.obrasSyneco.join(", ") || "—"}  |  Setor no Syneco: ${d.setorSyneco}`,
      `${t.marcasABaixar} marca(s) a baixar · ${nb(t.pecas)} peça(s) · ${nb(t.kg)} kg`
      + (t.jaApontadas ? `  |  ${t.jaApontadas} já apontada(s) no Syneco — não lançar de novo` : ""),
      "Esta planilha NÃO dá baixa: é a lista para lançar no Syneco. Depois do lançamento o portal atualiza sozinho pelo sync.",
    ],
    totalColunas: 7,
    nomePlanilha: "Baixa Syneco",
    codigoDoc: "REL-PRD-006",
  });

  ws.columns = [{ width: 14 }, { width: 18 }, { width: 34 }, { width: 18 }, { width: 10 }, { width: 12 }, { width: 12 }];
  let l = linhaInicio;
  adicionarHeaderTabela(ws, l, ["Obra (Syneco)", "Marca", "Descricao", "Perfil", "Qte", "Ja apontado", "A baixar"]);
  l++;
  for (const x of d.linhas) {
    adicionarLinhaTabela(ws, l, [x.obraSyneco || "—", x.marca, x.descricao || "", x.perfil || "",
      x.qte, x.jaApontado, x.aBaixar === 0 ? "ja apontada" : x.aBaixar]);
    l++;
  }
  adicionarLinhaTotais(ws, l, ["TOTAL", `${t.marcas} marcas`, "", "",
    d.linhas.reduce((s, x) => s + x.qte, 0), d.linhas.reduce((s, x) => s + x.jaApontado, 0), t.pecas]);

  await downloadWorkbook(workbook, `Baixa-Syneco-OP-${d.op.numero}-${setor}.xlsx`);
  return d;
}
