"use client";
import { useState, useEffect, useMemo } from "react";
import {
  CheckCircle2, Loader2, AlertCircle, Search, CalendarDays,
  Building2, Tag, FileSpreadsheet, RefreshCw,
} from "lucide-react";

const fmtMoeda = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtData = (iso) => (iso ? new Date(iso + "T12:00:00").toLocaleDateString("pt-BR") : "—");

function rangeHoje() { const d = new Date(); return { de: toISO(d), ate: toISO(d) }; }
function rangeSemana() {
  const d = new Date(); const dow = (d.getDay() + 6) % 7; // 0 = segunda
  const seg = new Date(d); seg.setDate(d.getDate() - dow);
  return { de: toISO(seg), ate: toISO(d) };
}
function rangeMes() {
  const d = new Date();
  return { de: toISO(new Date(d.getFullYear(), d.getMonth(), 1)), ate: toISO(d) };
}

const PRESETS = [
  { key: "hoje", label: "Hoje", range: rangeHoje },
  { key: "semana", label: "Semana", range: rangeSemana },
  { key: "mes", label: "Mês", range: rangeMes },
];

export default function ContasPagasClient() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const hojeR = rangeHoje();
  const [de, setDe] = useState(hojeR.de);
  const [ate, setAte] = useState(hojeR.ate);
  const [presetAtivo, setPreset] = useState("hoje");
  const [busca, setBusca] = useState("");
  const [exportando, setExportando] = useState(false);

  const carregar = async (d1 = de, d2 = ate) => {
    setLoading(true); setErro("");
    try {
      const qs = new URLSearchParams({ de: d1, ate: d2 });
      const res = await fetch(`/api/financeiro/contas-pagas?${qs}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Erro");
      setData(j);
    } catch (e) { setErro(e.message); } finally { setLoading(false); }
  };

  useEffect(() => { carregar(hojeR.de, hojeR.ate); /* eslint-disable-next-line */ }, []);

  const aplicarPreset = (p) => {
    const r = PRESETS.find((x) => x.key === p).range();
    setPreset(p); setDe(r.de); setAte(r.ate); carregar(r.de, r.ate);
  };

  const filtradas = useMemo(() => {
    const rows = data?.rows || [];
    const q = busca.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      (r.fornecedorNome || "").toLowerCase().includes(q) ||
      (r.categoriaNome || "").toLowerCase().includes(q) ||
      (r.numeroDocFiscal || "").toLowerCase().includes(q) ||
      (r.numeroDocumento || "").toLowerCase().includes(q)
    );
  }, [data, busca]);

  const totaisVisiveis = useMemo(() => ({
    valor: filtradas.reduce((s, r) => s + (r.valor || 0), 0),
    qtd: filtradas.length,
    fornecedores: new Set(filtradas.map((r) => r.fornecedorNome).filter(Boolean)).size,
  }), [filtradas]);

  const exportar = async () => {
    if (!filtradas.length || exportando) return;
    setExportando(true);
    try {
      const {
        criarRelatorioTorg, adicionarHeaderTabela, adicionarLinhaTabela,
        adicionarLinhaTotais, downloadWorkbook,
      } = await import("@/lib/excel-relatorio");

      const totalColunas = 7;
      const subtitulo = [
        `Pagamentos de ${fmtData(de)} a ${fmtData(ate)}`,
        busca.trim() && `Busca: "${busca.trim()}"`,
      ].filter(Boolean).join("   |   ");

      const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
        titulo: "Contas Pagas",
        subtitulo,
        nomePlanilha: "Contas Pagas",
        codigoDoc: "REL-FIN-003",
        totalColunas,
        kpis: [
          `Total pago: ${fmtMoeda(totaisVisiveis.valor)} (${totaisVisiveis.qtd} títulos)   |   Fornecedores: ${totaisVisiveis.fornecedores}`,
        ],
      });

      const colWidths = [12, 34, 15, 26, 14, 10, 12];
      colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

      let row = linhaInicio;
      adicionarHeaderTabela(ws, row, ["Pagamento", "Fornecedor", "Valor (R$)", "Categoria", "NF/Doc", "Parc.", "Vencimento"]);
      row++;
      const dataIni = row;

      let soma = 0;
      filtradas.forEach((r, idx) => {
        soma += r.valor || 0;
        adicionarLinhaTabela(ws, row, [
          fmtData(r.dataPagamento), r.fornecedorNome || "—", Number((r.valor || 0).toFixed(2)),
          r.categoriaNome || "—", r.numeroDocFiscal || r.numeroDocumento || "—",
          r.numeroParcela || "—", fmtData(r.dataVencimento),
        ], {
          fillColor: idx % 2 === 1 ? "F8FAFC" : undefined,
          alinhamento: { 2: "right", 5: "center" }, fontSize: 9, rowHeight: 16,
        });
        ws.getCell(row, 3).numFmt = "#,##0.00";
        row++;
      });

      const dataFim = row - 1;
      ws.autoFilter = { from: { row: linhaInicio, column: 1 }, to: { row: dataFim, column: totalColunas } };
      adicionarLinhaTotais(ws, row, ["", "TOTAL", { formula: `SUBTOTAL(9,C${dataIni}:C${dataFim})`, result: Number(soma.toFixed(2)) }, "", "", "", `${filtradas.length} títulos`]);
      ws.getCell(row, 3).numFmt = "#,##0.00";
      ws.views = [{ state: "frozen", ySplit: linhaInicio }];

      await downloadWorkbook(workbook, `Contas_Pagas_${de}_a_${ate}.xlsx`);
    } catch (e) {
      console.error("Erro ao exportar:", e);
      alert("Falha ao gerar o relatório: " + e.message);
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="space-y-5 max-w-7xl">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2">
            <CheckCircle2 size={28} className="text-emerald-600" /> Contas Pagas
          </h2>
          <p className="text-sm text-torg-gray mt-1">
            Pagamentos efetuados (data da baixa no Omie) — hoje, na semana ou no mês.
          </p>
        </div>
        <button
          onClick={exportar}
          disabled={exportando || loading || !filtradas.length}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium disabled:opacity-50"
        >
          {exportando ? <Loader2 size={15} className="animate-spin" /> : <FileSpreadsheet size={15} />}
          {exportando ? "Gerando…" : "Extrair relatório"}
        </button>
      </div>

      {/* Período + busca */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-3 flex-wrap">
        <div className="inline-flex bg-gray-100 rounded-lg p-1">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => aplicarPreset(p.key)}
              className={`inline-flex items-center px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                presetAtivo === p.key ? "bg-white text-torg-blue shadow-sm" : "text-torg-gray hover:text-torg-dark"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <CalendarDays size={15} className="text-torg-gray" />
          <input type="date" value={de} onChange={(e) => { setDe(e.target.value); setPreset(""); }}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
          <span className="text-torg-gray">a</span>
          <input type="date" value={ate} onChange={(e) => { setAte(e.target.value); setPreset(""); }}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
          <button onClick={() => carregar()} disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-torg-gray hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Aplicar
          </button>
        </div>
        <div className="relative ml-auto">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-torg-gray" />
          <input
            type="text" value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Fornecedor, categoria, NF…"
            className="pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg w-64 focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue outline-none"
          />
        </div>
      </div>

      {/* KPIs */}
      {!loading && !erro && data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-emerald-50 rounded-xl p-4">
            <p className="text-[11px] text-emerald-600 uppercase tracking-wider font-semibold">Total pago no período</p>
            <p className="text-2xl font-extrabold text-emerald-700 tabular-nums mt-1">{fmtMoeda(totaisVisiveis.valor)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <p className="text-[11px] text-torg-gray uppercase tracking-wider font-semibold">Títulos pagos</p>
            <p className="text-2xl font-extrabold text-torg-dark tabular-nums mt-1">{totaisVisiveis.qtd}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <p className="text-[11px] text-torg-gray uppercase tracking-wider font-semibold">Fornecedores distintos</p>
            <p className="text-2xl font-extrabold text-torg-dark tabular-nums mt-1">{totaisVisiveis.fornecedores}</p>
          </div>
        </div>
      )}

      {/* Conteúdo */}
      {loading ? (
        <div className="flex items-center justify-center py-20 gap-3 text-torg-gray">
          <Loader2 size={22} className="animate-spin" /> Consultando pagamentos no Omie…
        </div>
      ) : erro ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <AlertCircle size={32} className="mx-auto text-red-400 mb-3" />
          <p className="text-red-700 font-medium">{erro}</p>
          <button onClick={() => carregar()} className="mt-3 px-4 py-2 bg-red-100 text-red-700 rounded-lg text-sm hover:bg-red-200">
            Tentar novamente
          </button>
        </div>
      ) : filtradas.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <CheckCircle2 size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-torg-gray text-lg">Nenhum pagamento no período</p>
          <p className="text-sm text-gray-400 mt-1">
            {busca.trim() ? "Nada bate com a busca — limpe o filtro ou mude o período." : "Troque o período acima para ver outros pagamentos."}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[860px]">
              <thead className="bg-gray-50/60 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Pagamento</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fornecedor</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Valor</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Categoria</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">NF/Doc</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Parc.</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Vencimento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtradas.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 whitespace-nowrap text-torg-dark font-medium tabular-nums">{fmtData(r.dataPagamento)}</td>
                    <td className="px-4 py-2.5 text-torg-dark max-w-[260px] truncate" title={r.fornecedorNome || ""}>
                      <span className="inline-flex items-center gap-1.5">
                        <Building2 size={13} className="text-torg-gray shrink-0" />
                        {r.fornecedorNome || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-emerald-700 tabular-nums whitespace-nowrap">{fmtMoeda(r.valor)}</td>
                    <td className="px-4 py-2.5 text-torg-gray max-w-[220px] truncate" title={r.categoriaNome || ""}>
                      <span className="inline-flex items-center gap-1.5">
                        <Tag size={12} className="text-torg-gray shrink-0" />
                        {r.categoriaNome || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-torg-gray whitespace-nowrap">{r.numeroDocFiscal || r.numeroDocumento || "—"}</td>
                    <td className="px-4 py-2.5 text-center text-torg-gray text-xs">{r.numeroParcela || "—"}</td>
                    <td className="px-4 py-2.5 text-torg-gray whitespace-nowrap tabular-nums">{fmtData(r.dataVencimento)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-sm">
            <span className="text-torg-gray">{totaisVisiveis.qtd} título{totaisVisiveis.qtd !== 1 ? "s" : ""}</span>
            <span className="font-bold text-torg-dark">Total: <span className="text-emerald-700">{fmtMoeda(totaisVisiveis.valor)}</span></span>
          </div>
        </div>
      )}
    </div>
  );
}
