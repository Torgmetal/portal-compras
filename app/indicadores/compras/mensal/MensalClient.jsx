"use client";
import { useState, useEffect } from "react";
import { Loader2, AlertCircle, Download, CalendarRange, TrendingUp } from "lucide-react";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const fmtPct = (v) => (v == null ? "—" : `${v}%`);
const fmtMoeda = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtDias = (v) => (v == null ? "—" : `${v}d`);

// Cores por avaliação vs meta
const corPct = (v, bom = 90, medio = 70) => (v == null ? "text-gray-300" : v >= bom ? "text-emerald-600" : v >= medio ? "text-amber-600" : "text-red-600");
const corDias = (v, alvo = 5) => (v == null ? "text-gray-300" : v <= alvo ? "text-emerald-600" : v <= alvo * 2 ? "text-amber-600" : "text-red-600");

export default function MensalClient() {
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    let vivo = true;
    setLoading(true);
    setErro("");
    fetch(`/api/compras/indicadores/mensal?ano=${ano}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok || !j.success) throw new Error(j.error || "Erro ao carregar");
        return j;
      })
      .then((j) => vivo && setDados(j))
      .catch((e) => vivo && setErro(e.message))
      .finally(() => vivo && setLoading(false));
    return () => { vivo = false; };
  }, [ano]);

  async function exportar() {
    if (!dados || exportando) return;
    setExportando(true);
    try {
      const xl = await import("@/lib/excel-relatorio");
      const headers = ["Mês", "OTIF %", "On-Time %", "In-Full %", "Atend. (d)", "No alvo %", "Scorecard", "Gasto (R$)", "Nota"];
      const { workbook, sheet: ws, linhaInicio } = await xl.criarRelatorioTorg({
        titulo: `Indicadores de Compras — Evolucao Mensal ${dados.ano}`,
        subtitulo: `Mes a mes + acumulado (YTD). Metas: OTIF ${dados.metas.otif}%, Atendimento <=${dados.metas.atendimento} dias uteis.`,
        kpis: [`Acumulado ${dados.ano}: Nota ${dados.acumulado.nota ?? "—"} | OTIF ${fmtPct(dados.acumulado.otif.pct)} | Atend ${fmtDias(dados.acumulado.atendimento.mediaDias)} (${fmtPct(dados.acumulado.atendimento.pctAlvo)} no alvo) | Savings ${fmtPct(dados.acumulado.savings.pctSavings)} | Gasto ${fmtMoeda(dados.acumulado.gastoAno)}`],
        totalColunas: headers.length,
        nomePlanilha: `Compras Mensal ${dados.ano}`.slice(0, 31),
        codigoDoc: "REL-CMP-002",
      });
      ws.columns = [{ width: 8 }, { width: 10 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 16 }, { width: 9 }];
      let row = linhaInicio;
      xl.adicionarHeaderTabela(ws, row, headers); row++;
      for (const m of dados.meses) {
        xl.adicionarLinhaTabela(ws, row, [
          MESES[m.mes - 1], m.otif.pct ?? "—", m.otif.pctOnTime ?? "—", m.otif.pctInFull ?? "—",
          m.atendimento.mediaDias ?? "—", m.atendimento.pctAlvo ?? "—", m.scorecard.nota ?? "—",
          m.gastoMes || 0, m.nota ?? "—",
        ], { alinhamento: { 1: "center", 2: "center", 3: "center", 4: "center", 5: "center", 6: "center", 7: "right", 8: "center" } });
        row++;
      }
      const ac = dados.acumulado;
      xl.adicionarLinhaTotais(ws, row, [
        "ACUM.", ac.otif.pct ?? "—", ac.otif.pctOnTime ?? "—", ac.otif.pctInFull ?? "—",
        ac.atendimento.mediaDias ?? "—", ac.atendimento.pctAlvo ?? "—", ac.scorecard.nota ?? "—",
        ac.gastoAno || 0, ac.nota ?? "—",
      ]);
      await xl.downloadWorkbook(workbook, `Torg_Indicadores_Compras_Mensal_${dados.ano}.xlsx`);
    } catch (e) {
      setErro("Erro ao exportar: " + e.message);
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-6 gap-3">
        <div>
          <h1 className="text-xl font-bold text-torg-dark flex items-center gap-2">
            <CalendarRange size={20} className="text-torg-blue" /> Evolução Mensal — Compras
          </h1>
          <p className="text-xs text-torg-gray mt-0.5">Cada indicador <strong>mês a mês</strong> e no <strong>acumulado do ano</strong> (YTD), avaliado contra a meta.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <select value={ano} onChange={(e) => setAno(Number(e.target.value))}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 text-torg-dark focus:outline-none focus:ring-2 focus:ring-torg-blue/30">
            {[anoAtual, anoAtual - 1, anoAtual - 2].map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <button onClick={exportar} disabled={exportando || !dados}
            className="text-sm font-semibold text-torg-blue border border-torg-blue/30 hover:bg-torg-blue-50 px-3 py-2 rounded-lg inline-flex items-center gap-2 disabled:opacity-50">
            {exportando ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Exportar
          </button>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 p-10 text-center">
          <Loader2 size={22} className="mx-auto animate-spin text-torg-blue mb-2" />
          <p className="text-sm text-torg-gray">Carregando indicadores…</p>
        </div>
      ) : erro ? (
        <div className="bg-white rounded-xl border border-red-100 p-6">
          <div className="flex items-start gap-2 text-red-600 text-sm">
            <AlertCircle size={16} className="mt-0.5" />
            <div>
              <p className="font-medium">Erro ao carregar</p>
              <p className="text-xs mt-1">{erro}</p>
              <button onClick={() => setAno((a) => a)} className="mt-2 text-torg-blue hover:underline text-xs">Tentar novamente</button>
            </div>
          </div>
        </div>
      ) : !dados || dados.meses.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-10 text-center">
          <TrendingUp size={30} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-torg-gray">Sem dados de indicadores em {ano}.</p>
        </div>
      ) : (
        <>
          {/* Cards acumulado (YTD) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <CardAc label={`Nota do Setor (YTD)`} valor={dados.acumulado.nota ?? "—"} cor={corPct(dados.acumulado.nota, 80, 60)} sub={`Meta ${dados.metas.nota}`} />
            <CardAc label="OTIF (YTD)" valor={fmtPct(dados.acumulado.otif.pct)} cor={corPct(dados.acumulado.otif.pct)} sub={`Meta ${dados.metas.otif}% · ${dados.acumulado.otif.total} pedidos`} />
            <CardAc label="Atendimento (YTD)" valor={fmtDias(dados.acumulado.atendimento.mediaDias)} cor={corDias(dados.acumulado.atendimento.mediaDias)} sub={`${fmtPct(dados.acumulado.atendimento.pctAlvo)} no alvo (≤${dados.metas.atendimento}d)`} />
            <CardAc label="Savings (YTD)" valor={fmtPct(dados.acumulado.savings.pctSavings)} cor={dados.acumulado.savings.pctSavings >= 0 ? "text-emerald-600" : "text-red-600"} sub={fmtMoeda(dados.acumulado.savings.savingsR$)} />
          </div>

          {/* Tabela mês a mês */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/60">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Mês</th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase">OTIF</th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase">On-Time</th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase">In-Full</th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase">Atend.</th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase">No alvo</th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase">Scorecard</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Gasto</th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase">Nota</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {dados.meses.map((m) => (
                  <tr key={m.mes} className="hover:bg-gray-50">
                    <td className="px-3 py-2.5 font-medium text-torg-dark">{MESES[m.mes - 1]}</td>
                    <td className={`px-3 py-2.5 text-center font-semibold tabular-nums ${corPct(m.otif.pct)}`}>{fmtPct(m.otif.pct)}</td>
                    <td className={`px-3 py-2.5 text-center tabular-nums ${corPct(m.otif.pctOnTime)}`}>{fmtPct(m.otif.pctOnTime)}</td>
                    <td className={`px-3 py-2.5 text-center tabular-nums ${corPct(m.otif.pctInFull)}`}>{fmtPct(m.otif.pctInFull)}</td>
                    <td className={`px-3 py-2.5 text-center tabular-nums ${corDias(m.atendimento.mediaDias)}`}>{fmtDias(m.atendimento.mediaDias)}</td>
                    <td className={`px-3 py-2.5 text-center tabular-nums ${corPct(m.atendimento.pctAlvo)}`}>{fmtPct(m.atendimento.pctAlvo)}</td>
                    <td className={`px-3 py-2.5 text-center tabular-nums ${corPct(m.scorecard.nota, 80, 60)}`}>{m.scorecard.nota ?? "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-torg-dark">{m.gastoMes ? fmtMoeda(m.gastoMes) : "—"}</td>
                    <td className={`px-3 py-2.5 text-center font-bold tabular-nums ${corPct(m.nota, 80, 60)}`}>{m.nota ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-torg-blue-50/60 border-t-2 border-torg-blue/20 font-semibold">
                  <td className="px-3 py-3 text-torg-dark uppercase text-xs">Acum. {dados.ano}</td>
                  <td className={`px-3 py-3 text-center tabular-nums ${corPct(dados.acumulado.otif.pct)}`}>{fmtPct(dados.acumulado.otif.pct)}</td>
                  <td className={`px-3 py-3 text-center tabular-nums ${corPct(dados.acumulado.otif.pctOnTime)}`}>{fmtPct(dados.acumulado.otif.pctOnTime)}</td>
                  <td className={`px-3 py-3 text-center tabular-nums ${corPct(dados.acumulado.otif.pctInFull)}`}>{fmtPct(dados.acumulado.otif.pctInFull)}</td>
                  <td className={`px-3 py-3 text-center tabular-nums ${corDias(dados.acumulado.atendimento.mediaDias)}`}>{fmtDias(dados.acumulado.atendimento.mediaDias)}</td>
                  <td className={`px-3 py-3 text-center tabular-nums ${corPct(dados.acumulado.atendimento.pctAlvo)}`}>{fmtPct(dados.acumulado.atendimento.pctAlvo)}</td>
                  <td className={`px-3 py-3 text-center tabular-nums ${corPct(dados.acumulado.scorecard.nota, 80, 60)}`}>{dados.acumulado.scorecard.nota ?? "—"}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-torg-dark">{fmtMoeda(dados.acumulado.gastoAno)}</td>
                  <td className={`px-3 py-3 text-center font-bold tabular-nums ${corPct(dados.acumulado.nota, 80, 60)}`}>{dados.acumulado.nota ?? "—"}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Savings acumulado (cumulativo por obra) */}
          <div className="mt-4 bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <h3 className="text-sm font-semibold text-torg-dark mb-2 flex items-center gap-2"><TrendingUp size={15} className="text-torg-blue" /> Savings acumulado (cumulativo por obra)</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <MiniAc label="Verba total" valor={fmtMoeda(dados.acumulado.savings.totalVerba)} />
              <MiniAc label="Total gasto" valor={fmtMoeda(dados.acumulado.savings.totalGasto)} />
              <MiniAc label="Economia" valor={fmtMoeda(dados.acumulado.savings.savingsR$)} cor={dados.acumulado.savings.savingsR$ >= 0 ? "text-emerald-600" : "text-red-600"} />
              <MiniAc label="% Savings" valor={fmtPct(dados.acumulado.savings.pctSavings)} cor={dados.acumulado.savings.pctSavings >= 0 ? "text-emerald-600" : "text-red-600"} />
            </div>
            <p className="text-[11px] text-torg-gray mt-2">Savings é cumulativo por obra (verba − gasto de todas as OPs abertas/encerradas), não um fluxo mensal — por isso aparece só no acumulado. A coluna “Gasto” da tabela mostra o desembolso de cada mês.</p>
          </div>
        </>
      )}
    </div>
  );
}

function CardAc({ label, valor, sub, cor }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <p className="text-[11px] uppercase tracking-wide text-torg-gray font-medium">{label}</p>
      <p className={`text-2xl font-extrabold tabular-nums mt-1 ${cor}`}>{valor}</p>
      {sub && <p className="text-[11px] text-torg-gray mt-0.5">{sub}</p>}
    </div>
  );
}

function MiniAc({ label, valor, cor = "text-torg-dark" }) {
  return (
    <div>
      <p className="text-[11px] text-torg-gray">{label}</p>
      <p className={`text-base font-bold tabular-nums ${cor}`}>{valor}</p>
    </div>
  );
}
