"use client";
import { criarRelatorioTorg, adicionarHeaderTabela, adicionarLinhaTabela, adicionarLinhaTotais, downloadWorkbook } from "@/lib/excel-relatorio";

/* A LISTA DO POSTO EM EXCEL — "o que está no nome do Jurandir".
 *
 * ⚠ Vitor (08/09/2026): "na frente do nome do montador… uma lista completa do que está no nome do
 * montador, por dia ou semana, e sair a planilha que já usamos de modelo". O modelo é o padrão
 * TORG (lib/excel-relatorio.js), o mesmo das outras folhas que vão para o chão de fábrica.
 *
 * ⚠ A lista é do SALDO: quem recebe quer o que falta fazer. Marca já concluída aparece, marcada,
 * para ninguém achar que sumiu — mas não entra no total.
 */
const nb = (v) => (v == null ? "" : Number(v).toLocaleString("pt-BR"));
const dbr = (s) => (s ? s.split("-").reverse().join("/") : "");

export async function baixarListaDoPosto({ setor, recurso, nomePosto, de, ate, periodo }) {
  const qs = new URLSearchParams({ setor, recurso: recurso || "", de, ate });
  const res = await fetch(`/api/pcp/lista-posto?${qs}`, { cache: "no-store" });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error || "Falha ao montar a lista");
  if (!d.linhas.length) throw new Error(`Nada programado para ${nomePosto} ${periodo === "dia" ? "hoje" : "nesta semana"}.`);

  const t = d.total;
  const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
    titulo: `Lista de trabalho — ${nomePosto}`,
    subtitulo: `${setor} · ${periodo === "dia" ? dbr(de) : `${dbr(de)} a ${dbr(ate)}`}`,
    kpis: [
      `${t.marcasAbertas} marca(s) a fazer · ${nb(t.pecas)} peça(s) · ${nb(t.kg)} kg`
      + (t.marcas - t.marcasAbertas ? `  |  ${t.marcas - t.marcasAbertas} já concluída(s)` : ""),
      `OP(s): ${t.ops.join(", ") || "—"}`,
    ],
    totalColunas: 8,
    nomePlanilha: "Lista do posto",
    codigoDoc: "REL-PRD-007",
  });

  ws.columns = [{ width: 11 }, { width: 9 }, { width: 22 }, { width: 16 }, { width: 32 }, { width: 18 }, { width: 8 }, { width: 10 }];
  let l = linhaInicio;
  adicionarHeaderTabela(ws, l, ["Dia", "OP", "Obra", "Marca", "Descricao", "Perfil", "A fazer", "Peso (kg)"]);
  l++;
  for (const x of d.linhas) {
    adicionarLinhaTabela(ws, l, [dbr(x.dia), x.opNumero || "", (x.obra || "").slice(0, 22), x.marca,
      x.descricao || "", x.perfil || "", x.saldo === 0 ? "concluida" : x.saldo, x.kg]);
    l++;
  }
  adicionarLinhaTotais(ws, l, ["TOTAL", "", `${t.marcasAbertas} marcas`, "", "", "", t.pecas, t.kg]);

  await downloadWorkbook(workbook, `Lista-${nomePosto.replace(/\s+/g, "-")}-${de}${periodo === "semana" ? `_a_${ate}` : ""}.xlsx`);
  return d;
}
