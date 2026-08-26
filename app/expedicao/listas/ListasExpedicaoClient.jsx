"use client";
// LISTAS DE EXPEDIÇÃO — o que cada obra ainda deve, em planilha.
//
// Vitor (19/08/2026): "no portal da expedição você consegue deixar uma aba chamada Listas de
// Expedição? Essa página tem que aparecer as obras que estão com peças em aberto para envio".
// E (25/08/2026): "se for mostrar ela, crie no mesmo esquema que estamos fazendo das outras — em
// formato de planilha, filtros, botão para exportar a planilha".
//
// ⚠⚠ ERA CARTÃO POR OBRA COM TABELA DENTRO. Para achar uma marca era preciso saber em qual obra
// ela estava e abrir o cartão certo. Em planilha plana, o funil faz o trabalho: filtra por obra,
// frente, grupo ou setor sem decorar onde a peça mora.
//
// ⚠ A LISTA é a fonte certa aqui porque tem 100% do que a obra entrega — estrutura, cobertura,
// grade, fixação. O portal por OP mostra o que o Planejamento direcionou; esta mostra o que a OBRA
// ainda deve, direcionado ou não.
import { useState, useEffect, useCallback, useMemo } from "react";
import { ClipboardList, Loader2, AlertCircle, RefreshCw, FileSpreadsheet, PackageCheck } from "lucide-react";
import { useFiltroColunas, ThFiltro } from "@/components/FiltroColuna";
import { fmtOP } from "@/lib/utils";

const fmtN = (n) => Number(n || 0).toLocaleString("pt-BR");
const fmtKg = (n) => `${Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;

const COLUNAS = [
  { key: "op",      label: "OP",      valor: (i) => fmtOP(i.opNumero) },
  { key: "cliente", label: "Cliente", valor: (i) => i.cliente || "—" },
  { key: "frente",  label: "Frente",  valor: (i) => i.frente || "—" },
  { key: "grupo",   label: "Grupo",   valor: (i) => i.grupoLabel || i.grupo || "—" },
  { key: "setor",   label: "Onde parou", valor: (i) => i.setorLabel || "sem apontamento" },
];

export default function ListasExpedicaoClient() {
  const [data, setData] = useState(null);
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(true);
  const [col, setCol] = useState(null);
  const [baixando, setBaixando] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true); setErro("");
    try {
      const r = await fetch("/api/expedicao/listas", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao carregar");
      setData(j);
    } catch (e) { setErro(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  // ⚠ achata as obras numa lista só: a planilha é de MARCAS, não de obras.
  const itens = useMemo(() => (data?.obras || []).flatMap((o) =>
    (o.itensFaltantes || []).map((i) => ({
      ...i, opNumero: o.opNumero, cliente: o.cliente || "", obra: o.obra || "",
      grupoLabel: i.grupoLabel || i.grupo,
    }))), [data]);

  const f = useFiltroColunas(itens, COLUNAS);
  const fp = { filtros: f.filtros, setFiltros: f.setFiltros, opcoesDaColuna: f.opcoesDaColuna, aberta: col, setAberta: setCol };

  const soma = useMemo(() => f.filtradas.reduce((a, i) => ({
    kg: a.kg + (Number(i.pesoKg) || 0), qtd: a.qtd + (Number(i.qtd) || 0),
    prontas: a.prontas + (i.pronta ? 1 : 0),
  }), { kg: 0, qtd: 0, prontas: 0 }), [f.filtradas]);

  async function exportar() {
    if (!f.filtradas.length) return;
    setBaixando(true); setErro("");
    try {
      const { criarRelatorioTorg, adicionarHeaderTabela, adicionarLinhaTabela, adicionarRodapeISO, downloadWorkbook } =
        await import("@/lib/excel-relatorio");
      const cab = ["OP", "Cliente", "Obra", "Frente", "Marca", "Descrição", "Grupo", "Qtd", "Peso (kg)", "Onde parou", "Pronta p/ enviar", "Status no portal"];
      const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
        titulo: "Listas de Expedição — o que falta enviar",
        subtitulo: f.ativos ? `Filtro: ${f.rotulosAtivos.join(", ")}` : "Todas as obras com peça em aberto",
        kpis: [`${fmtN(f.filtradas.length)} marca(s)`, fmtKg(soma.kg), `${fmtN(soma.prontas)} já pintada(s)`],
        totalColunas: cab.length, nomePlanilha: "A enviar", codigoDoc: "REL-EXP-002",
      });
      ws.columns = [{ width: 10 }, { width: 20 }, { width: 26 }, { width: 12 }, { width: 16 }, { width: 34 },
        { width: 16 }, { width: 8 }, { width: 12 }, { width: 16 }, { width: 16 }, { width: 16 }];
      // ⚠ os helpers NÃO devolvem a próxima linha — contar aqui, senão a planilha sai vazia.
      let l = linhaInicio;
      adicionarHeaderTabela(ws, l, cab); l++;
      for (const i of f.filtradas) {
        adicionarLinhaTabela(ws, l, [
          fmtOP(i.opNumero), i.cliente, i.obra, i.frente, i.marca, i.descricao || "",
          i.grupoLabel || i.grupo || "", i.qtd, Math.round(i.pesoKg || 0),
          i.setorLabel || "sem apontamento", i.pronta ? "sim" : "", i.statusPortal || "",
        ], { alinhamento: { 7: "right", 8: "right" } });
        l++;
      }
      adicionarRodapeISO(ws, l + 1, cab.length);
      await downloadWorkbook(workbook, "Listas de Expedicao - a enviar.xlsx");
    } catch (e) { setErro(`Não consegui gerar a planilha: ${e?.message || e}`); }
    finally { setBaixando(false); }
  }

  const t = data?.totais;

  return (
    <div className="space-y-4 max-w-7xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="bg-torg-blue-50 p-2.5 rounded-xl"><ClipboardList size={22} className="text-torg-blue" /></div>
          <div>
            <h1 className="text-2xl font-bold text-torg-dark">Listas de Expedição</h1>
            <p className="text-sm text-torg-gray">
              O que cada obra ainda deve entregar, pela lista da Engenharia — estrutura, cobertura,
              grade e fixação. Marca com baixa em romaneio ou na planilha do servidor já saiu daqui.
            </p>
          </div>
        </div>
        <button onClick={carregar} disabled={loading}
          className="p-2.5 rounded-xl bg-white border border-torg-blue-100 hover:border-torg-blue-300 text-torg-dark disabled:opacity-50">
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle size={16} /> {erro}
        </div>
      )}

      {t && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi n={fmtN(t.obras)} l="Obras com peça em aberto" />
          <Kpi n={fmtN(t.marcasFaltantes)} l="Marcas a enviar" />
          <Kpi n={fmtKg(t.faltanteKg)} l="Peso a enviar" cor="text-torg-dark" />
          {/* ⚠ "pronta" = já passou pela pintura. É o que dá para carregar hoje, e é a única parte
              da fila que a Expedição consegue agir sozinha. */}
          <Kpi n={fmtKg(t.prontasKg)} l="Já pintado, pronto para carregar" sub={`${fmtN(t.prontasMarcas)} marca(s)`} cor="text-emerald-700" />
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="flex items-center gap-3 flex-wrap px-4 py-3 border-b border-gray-100">
          <span className="text-[12px] text-torg-gray">
            {loading ? "carregando…" : `${fmtN(f.filtradas.length)} de ${fmtN(itens.length)} marca(s) · ${fmtKg(soma.kg)}`}
          </span>
          {soma.prontas > 0 && <span className="text-[12px] text-emerald-700">{fmtN(soma.prontas)} pronta(s) para carregar</span>}
          {f.ativos > 0 && (
            <button onClick={f.limpar} className="text-[11px] text-torg-orange hover:underline">
              limpar filtro ({f.rotulosAtivos.join(", ")})
            </button>
          )}
          <button onClick={exportar} disabled={baixando || !f.filtradas.length}
            className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-semibold text-torg-gray hover:bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 disabled:opacity-40">
            {baixando ? <Loader2 size={12} className="animate-spin" /> : <FileSpreadsheet size={12} />} Planilha
          </button>
        </div>

        <div className="overflow-x-auto max-h-[34rem] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[11px] uppercase text-torg-gray sticky top-0 z-10">
              <tr>
                <ThFiltro col="op" label="OP" className="px-3 py-2 font-semibold text-left" {...fp} />
                <ThFiltro col="cliente" label="Cliente" className="px-3 py-2 font-semibold text-left" {...fp} />
                <ThFiltro col="frente" label="Frente" className="px-3 py-2 font-semibold text-left" {...fp} />
                <th className="px-3 py-2 font-semibold text-left">Marca</th>
                <th className="px-3 py-2 font-semibold text-left">Descrição</th>
                <ThFiltro col="grupo" label="Grupo" className="px-3 py-2 font-semibold text-left" {...fp} />
                <th className="px-3 py-2 font-semibold text-right">Qtd</th>
                <th className="px-3 py-2 font-semibold text-right">Peso</th>
                <ThFiltro col="setor" label="Onde parou" className="px-3 py-2 font-semibold text-left" {...fp} />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading && <tr><td colSpan={9} className="px-3 py-10 text-center"><Loader2 size={20} className="animate-spin mx-auto text-torg-blue" /></td></tr>}
              {!loading && !itens.length && (
                <tr><td colSpan={9} className="px-3 py-10 text-center text-sm text-torg-gray">Nenhuma obra com peça em aberto.</td></tr>
              )}
              {!loading && itens.length > 0 && !f.filtradas.length && (
                <tr><td colSpan={9} className="px-3 py-10 text-center text-sm text-torg-gray">Nada com esse filtro.</td></tr>
              )}
              {f.filtradas.map((i, k) => (
                <tr key={`${i.opNumero}-${i.frente}-${i.marca}-${k}`} className={`hover:bg-gray-50/60 ${i.pronta ? "bg-emerald-50/30" : ""}`}>
                  <td className="px-3 py-1.5 font-mono text-[12px] text-torg-blue whitespace-nowrap">{fmtOP(i.opNumero)}</td>
                  <td className="px-3 py-1.5 text-[12px] text-torg-gray truncate max-w-[16ch]" title={i.cliente}>{i.cliente || "—"}</td>
                  <td className="px-3 py-1.5 text-[12px] text-torg-gray whitespace-nowrap">{i.frente}</td>
                  <td className="px-3 py-1.5 font-mono text-[12px] font-semibold text-torg-dark whitespace-nowrap">{i.marca}</td>
                  <td className="px-3 py-1.5 text-[12px] text-torg-gray truncate max-w-[30ch]" title={i.descricao || ""}>{i.descricao || "—"}</td>
                  <td className="px-3 py-1.5 text-[12px] text-torg-gray whitespace-nowrap">{i.grupoLabel || i.grupo || "—"}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-[12px]">{fmtN(i.qtd)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-[12px] whitespace-nowrap">{fmtKg(i.pesoKg)}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    {i.pronta
                      ? <span className="text-[11px] text-emerald-700 inline-flex items-center gap-1"><PackageCheck size={11} /> {i.setorLabel}</span>
                      : <span className="text-[11px] text-torg-gray">{i.setorLabel || "sem apontamento"}</span>}
                    {/* ⚠ divergência que alguém precisa ver: o portal diz EXPEDIDO e a lista diz que falta. */}
                    {i.statusPortal === "EXPEDIDO" && <span className="block text-[10px] text-amber-700">portal diz expedido</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Kpi({ n, l, sub, cor = "text-torg-dark" }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3">
      <p className={`text-xl font-bold tabular-nums ${cor}`}>{n}</p>
      <p className="text-[11px] text-torg-gray mt-0.5">{l}</p>
      {sub && <p className="text-[10px] text-torg-gray-light">{sub}</p>}
    </div>
  );
}
