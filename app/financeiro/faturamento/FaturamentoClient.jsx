"use client";
import { useState, useMemo, useEffect } from "react";
import { FileText, RefreshCw, Clock, Search, Loader2, AlertCircle, ArrowUp, ArrowDown, ChevronsUpDown, Landmark, AlertTriangle, FileSpreadsheet } from "lucide-react";

const fmtMoeda = (v) =>
  v != null ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

export default function FaturamentoClient() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro]       = useState("");
  const [busca, setBusca]     = useState("");
  const [soAFaturar, setSoAFaturar] = useState(false);
  const [expandida, setExpandida] = useState(null);
  // Ordenação: campo + direção. Default = mais a faturar primeiro (igual ao backend).
  const [ordenarPor, setOrdenarPor] = useState("aFaturar");
  const [direcao, setDirecao] = useState("desc");
  const [exportando, setExportando] = useState(false);

  const clicarOrdenar = (campo) => {
    if (ordenarPor === campo) {
      setDirecao((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setOrdenarPor(campo);
      // texto começa A→Z; números começam do maior pro menor
      setDirecao(campo === "projeto" ? "asc" : "desc");
    }
  };

  const carregar = async (forcar = false) => {
    setLoading(true); setErro("");
    try {
      const res = await fetch(`/api/financeiro/pedidos-venda${forcar ? "?forcar=1" : ""}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Erro");
      setData(d);
    } catch (e) { setErro(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { carregar(false); }, []);

  const obras = useMemo(() => {
    if (!data?.obras) return [];
    let base = data.obras;
    if (soAFaturar) base = base.filter((o) => o.aFaturar > 0);
    const t = busca.trim().toLowerCase();
    if (t) base = base.filter((o) => (o.projeto || "").toLowerCase().includes(t));

    const fator = direcao === "asc" ? 1 : -1;
    const ordenada = [...base].sort((a, b) => {
      if (ordenarPor === "projeto") {
        return fator * String(a.projeto || "").localeCompare(String(b.projeto || ""), "pt-BR", { numeric: true });
      }
      const va = Number(a[ordenarPor] || 0), vb = Number(b[ordenarPor] || 0);
      return fator * (va - vb);
    });
    return ordenada;
  }, [data, busca, soAFaturar, ordenarPor, direcao]);

  // KPIs do topo: calculados sobre a lista FILTRADA (mudam conforme busca/"só a faturar")
  const totais = useMemo(() => {
    const faturado = obras.reduce((s, o) => s + (o.faturado || 0), 0);
    const aFaturar = obras.reduce((s, o) => s + (o.aFaturar || 0), 0);
    return {
      faturado, aFaturar,
      contratado: faturado + aFaturar,
      qtd: obras.length,
      comAtraso: obras.filter((o) => o.atrasado).length,
    };
  }, [obras]);

  const filtrado = soAFaturar || !!busca.trim();

  // Exporta o faturamento por obra (uma linha por medição, com a NF emitida) no
  // template ISO 9001 da Torg.
  const exportarXlsx = async () => {
    if (!data || obras.length === 0) return;
    setExportando(true);
    try {
      const {
        criarRelatorioTorg, adicionarHeaderTabela, adicionarLinhaTabela,
        adicionarLinhaTotais, downloadWorkbook,
      } = await import("@/lib/excel-relatorio");

      const totalColunas = 8;
      const subtitulo = [
        soAFaturar && "Filtro: só com a faturar",
        busca.trim() && `Busca: "${busca.trim()}"`,
        data.atualizadoEm && `Atualizado: ${fmtData(data.atualizadoEm)}`,
      ].filter(Boolean).join("   |   ");

      const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
        titulo: "Faturamento por obra",
        subtitulo,
        nomePlanilha: "Faturamento",
        codigoDoc: "REL-FIN-003",
        totalColunas,
        kpis: [
          `Já faturado: ${fmtMoeda(totais.faturado)}   |   A faturar: ${fmtMoeda(totais.aFaturar)}   |   Total contratado: ${fmtMoeda(totais.contratado)}   |   Obras: ${totais.qtd} (${totais.comAtraso} com atraso)`,
        ],
      });

      const colWidths = [38, 8, 14, 12, 16, 12, 16, 16];
      colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

      let row = linhaInicio;
      adicionarHeaderTabela(ws, row, ["Obra / Projeto", "OP", "Tipo", "Medição", "NF emitida", "Situação", "Faturado (R$)", "A faturar (R$)"]);
      row++;
      const dataIni = row;

      let somaFat = 0, somaAFat = 0, idx = 0;
      for (const o of obras) {
        const linhas = (o.pedidos && o.pedidos.length > 0)
          ? o.pedidos.map((p) => ({
              tipo: p.origem === "servico" ? "Serviço (OS)" : "Venda",
              medicao: p.numero, nf: (p.nfs || []).join(", "),
              situacao: p.aFaturar <= 0 ? "Faturado" : p.faturado > 0 ? "Parcial" : "A faturar",
              faturado: p.faturado || 0, aFaturar: p.aFaturar || 0,
            }))
          : [{ tipo: o.faturadoAvulso > 0 ? "NFS-e avulsa" : o.tipo, medicao: "—", nf: "—",
               situacao: o.aFaturar > 0 ? "A faturar" : "Faturado", faturado: o.faturado || 0, aFaturar: o.aFaturar || 0 }];

        for (const ln of linhas) {
          somaFat += ln.faturado; somaAFat += ln.aFaturar;
          adicionarLinhaTabela(ws, row, [
            o.projeto, o.numeroOp ? `OP-${o.numeroOp}` : "—", ln.tipo, ln.medicao, ln.nf || "—",
            ln.situacao, Number(ln.faturado.toFixed(2)), Number(ln.aFaturar.toFixed(2)),
          ], {
            fillColor: idx % 2 === 1 ? "F8FAFC" : undefined,
            alinhamento: { 1: "center", 5: "center", 6: "right", 7: "right" },
            fontColors: ln.situacao === "Faturado" ? { 5: "2E7D32" } : ln.situacao === "Parcial" ? { 5: "F4801F" } : {},
            fontSize: 9, rowHeight: 16,
          });
          ws.getCell(row, 7).numFmt = "#,##0.00";
          ws.getCell(row, 8).numFmt = "#,##0.00";
          row++; idx++;
        }
      }

      const dataFim = row - 1;
      ws.autoFilter = { from: { row: linhaInicio, column: 1 }, to: { row: dataFim, column: totalColunas } };

      // Totais com SUBTOTAL — corretos e respeitam o filtro.
      adicionarLinhaTotais(ws, row, [
        "", "", "", "", "", "TOTAL",
        { formula: `SUBTOTAL(9,G${dataIni}:G${dataFim})`, result: Number(somaFat.toFixed(2)) },
        { formula: `SUBTOTAL(9,H${dataIni}:H${dataFim})`, result: Number(somaAFat.toFixed(2)) },
      ]);
      ws.getCell(row, 7).numFmt = "#,##0.00";
      ws.getCell(row, 8).numFmt = "#,##0.00";
      ws.views = [{ state: "frozen", ySplit: linhaInicio }];

      await downloadWorkbook(workbook, `Faturamento_por_obra_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) {
      console.error("Erro ao exportar:", e);
      setErro("Erro ao gerar planilha: " + e.message);
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2">
            <FileText size={26} className="text-torg-blue" /> Faturamento por obra
          </h2>
          <p className="text-sm text-torg-gray mt-1">
Vendas de produto + Ordens de Serviço do Omie por obra: quanto já foi faturado e quanto falta. A tag mostra se a obra tem venda, serviço ou os dois.
            {data?.atualizadoEm && ` Atualizado ${fmtData(data.atualizadoEm)} ${new Date(data.atualizadoEm).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportarXlsx} disabled={exportando || loading || !data || obras.length === 0}
            title="Exportar o faturamento por obra (com a NF emitida) para Excel"
            className="px-3 py-2 text-sm border border-gray-300 text-torg-gray rounded-lg hover:bg-gray-50 inline-flex items-center gap-2 disabled:opacity-50">
            {exportando ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} className="text-emerald-600" />}
            {exportando ? "Gerando…" : "Extrair relatório"}
          </button>
          <button onClick={() => carregar(true)} disabled={loading}
            className="px-3 py-2 text-sm border border-gray-300 text-torg-gray rounded-lg hover:bg-gray-50 inline-flex items-center gap-2 disabled:opacity-50">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Atualizar
          </button>
        </div>
      </div>

      {/* KPIs — refletem o filtro atual */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-green-100 p-4">
            <p className="text-xs text-torg-gray">Já faturado{filtrado && " (filtro)"}</p>
            <p className="text-xl font-extrabold text-green-700 tabular-nums mt-1">{fmtMoeda(totais.faturado)}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-amber-100 p-4">
            <p className="text-xs text-torg-gray">A faturar{filtrado && " (filtro)"}</p>
            <p className="text-xl font-extrabold text-amber-700 tabular-nums mt-1">{fmtMoeda(totais.aFaturar)}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-torg-blue-100 p-4">
            <p className="text-xs text-torg-gray">Total contratado{filtrado && " (filtro)"}</p>
            <p className="text-xl font-extrabold text-torg-blue tabular-nums mt-1">{fmtMoeda(totais.contratado)}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <p className="text-xs text-torg-gray">Obras{filtrado && " (filtro)"}</p>
            <p className="text-xl font-extrabold text-torg-dark tabular-nums mt-1">{totais.qtd}</p>
            <p className="text-[10px] text-red-600 mt-0.5">{totais.comAtraso} com atraso</p>
          </div>
        </div>
      )}

      {/* Filtros */}
      {data && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar obra/projeto…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue focus:border-torg-blue" />
          </div>
          <button onClick={() => setSoAFaturar(v => !v)}
            className={`px-3 py-2 rounded-lg border text-sm inline-flex items-center gap-1.5 ${soAFaturar ? "bg-amber-500 text-white border-amber-500" : "bg-amber-50 text-amber-700 border-amber-200 hover:opacity-80"}`}>
            Só com a faturar
          </button>
        </div>
      )}

      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5 shrink-0" /> <span>{erro}</span>
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center justify-center gap-2 py-16 text-torg-gray">
          <Loader2 size={20} className="animate-spin" /> <span>Consultando pedidos no Omie… (pode levar ~40s na 1ª vez)</span>
        </div>
      ) : data && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/60 border-b border-gray-100">
                <tr>
                  <Th campo="projeto"   label="Obra / Projeto" align="left"   {...{ ordenarPor, direcao, clicarOrdenar }} />
                  <Th campo="faturado"  label="Faturado"       align="right"  {...{ ordenarPor, direcao, clicarOrdenar }} />
                  <Th campo="aFaturar"  label="A faturar"      align="right"  {...{ ordenarPor, direcao, clicarOrdenar }} />
                  <Th campo="total"     label="Total"          align="right"  {...{ ordenarPor, direcao, clicarOrdenar }} />
                  <Th campo="pctFaturado" label="% Fat."       align="center" {...{ ordenarPor, direcao, clicarOrdenar }} />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {obras.map((o) => (
                  <FragmentObra key={o.codProj} obra={o} aberta={expandida === o.codProj}
                    onToggle={() => setExpandida(expandida === o.codProj ? null : o.codProj)} />
                ))}
                {obras.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-torg-gray text-sm">Nenhuma obra encontrada.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Conciliação NFS-e Conchal (SigissWeb) */}
      <ConciliacaoNfse projetos={data?.projetos || []} onVinculado={() => carregar(false)} />
    </div>
  );
}

function ConciliacaoNfse({ projetos = [], onVinculado }) {
  const hojeISO = new Date().toISOString().slice(0, 10);
  const [data, setData]     = useState(null);
  const [loading, setLoad]  = useState(false);
  const [erro, setErro]     = useState("");
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(null); // chave da nota sendo salva
  const [de, setDe]   = useState(`${new Date().getFullYear()}-01-01`); // início do ano
  const [ate, setAte] = useState(hojeISO);

  const consultar = async () => {
    setLoad(true); setErro("");
    try {
      const qs = new URLSearchParams();
      if (de)  qs.set("de", de);
      if (ate) qs.set("ate", ate);
      const res = await fetch(`/api/financeiro/nfse-conchal?${qs}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Erro");
      setData(d);
    } catch (e) { setErro(e.message); } finally { setLoad(false); }
  };

  const onToggle = () => {
    const novo = !aberto; setAberto(novo);
    if (novo && !data && !loading) consultar();
  };

  // Vincula/desvincula a nota a um projeto e atualiza o estado local + a tabela acima
  const vincular = async (n, codProjStr) => {
    const codProj = codProjStr ? Number(codProjStr) : null;
    const proj = projetos.find(p => String(p.codProj) === String(codProj));
    const chave = `${n.numero}-${n.serie}`;
    setSalvando(chave);
    try {
      const res = await fetch("/api/financeiro/nfse-conchal/vincular", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numero: n.numero, serie: n.serie || "", codProj,
          projetoNome: proj?.nome ?? null, valor: n.valor, data: n.data,
          tomadorNome: n.tomadorNome, descricao: n.descricao,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Erro ao vincular");
      // update otimista local
      setData(prev => ({
        ...prev,
        notas: prev.notas.map(x => (x.numero === n.numero && x.serie === n.serie)
          ? { ...x, vinculoCodProj: codProj, vinculoProjeto: proj?.nome ?? null } : x),
      }));
      onVinculado?.(); // refaz o cálculo do faturado na tabela acima
    } catch (e) { alert(e.message); } finally { setSalvando(null); }
  };

  const foraDoOmie = (data?.notas || []).filter(n => !n.cancelada && n.foraDoOmie === true);

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <button onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50/60 transition-colors">
        <span className="flex items-center gap-2 text-sm font-semibold text-torg-dark">
          <span className={`text-gray-400 transition-transform ${aberto ? "rotate-90" : ""}`}>▶</span>
          <Landmark size={16} className="text-purple-600" />
          Conciliação NFS-e — Prefeitura de Conchal (SigissWeb)
        </span>
        <span className="text-xs text-torg-gray">notas de serviço emitidas fora do Omie</span>
      </button>

      {aberto && (
        <div className="border-t border-gray-50 p-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-torg-gray">
              <Loader2 size={18} className="animate-spin" /> <span>Consultando SigissWeb… (pode levar ~30s)</span>
            </div>
          ) : erro ? (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
              <AlertCircle size={14} className="mt-0.5 shrink-0" /> <span>{erro}</span>
              <button onClick={consultar} className="ml-auto underline shrink-0">Tentar novamente</button>
            </div>
          ) : data && !data.configurado ? (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{data.aviso} <span className="text-amber-600">(env: SIGISS_URL, SIGISS_LOGIN, SIGISS_SENHA)</span></span>
            </div>
          ) : data ? (
            <div className="space-y-3">
              {/* Seletor de período */}
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className="text-torg-gray font-medium">Período:</span>
                <input type="date" value={de} max={ate} onChange={e => setDe(e.target.value)}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:ring-2 focus:ring-torg-blue focus:border-torg-blue" />
                <span className="text-gray-400">até</span>
                <input type="date" value={ate} min={de} max={hojeISO} onChange={e => setAte(e.target.value)}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:ring-2 focus:ring-torg-blue focus:border-torg-blue" />
                <button onClick={consultar} disabled={loading}
                  className="px-2.5 py-1 bg-torg-blue text-white rounded-lg hover:opacity-90 inline-flex items-center gap-1 disabled:opacity-50">
                  {loading ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />} Buscar
                </button>
              </div>
              <div className="flex items-center gap-4 flex-wrap text-sm">
                <span className="text-torg-gray">Mostrando {fmtData(data.periodo?.de)} → {fmtData(data.periodo?.ate)}</span>
                <span className="text-torg-dark"><strong>{data.resumo?.ativas || 0}</strong> notas ativas</span>
                <span className="text-red-700 font-semibold">{data.resumo?.foraDoOmie || 0} fora do Omie</span>
                <span className="text-green-700">{foraDoOmie.filter(n => n.vinculoCodProj).length} vinculadas</span>
                <span className="text-amber-700">{fmtMoeda(data.resumo?.valorForaDoOmie)} fora do Omie</span>
              </div>
              <div className="text-xs text-torg-gray">Vincule cada nota ao projeto do Omie — o valor soma no <strong>faturado</strong> da obra na tabela acima.</div>
              {data.truncadoEnriquecimento && (
                <div className="text-xs text-amber-600 flex items-center gap-1">
                  <AlertTriangle size={11} /> Muitas notas no período — detalhada só as 150 mais recentes. Reduza o período para ver todas.
                </div>
              )}
              {foraDoOmie.length === 0 ? (
                <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  ✓ Nenhuma NFS-e fora do Omie no período — tudo conciliado.
                </div>
              ) : (
                <div className="overflow-x-auto border border-gray-100 rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50/60">
                      <tr>
                        <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase whitespace-nowrap">NFS-e</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Data</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase">Tomador</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Obra (descrição)</th>
                        <th className="text-right px-3 py-2 text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Valor</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Vincular ao projeto Omie</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase">Descrição</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {foraDoOmie.map(n => {
                        const chave = `${n.numero}-${n.serie}`;
                        return (
                        <tr key={chave} className={`hover:bg-gray-50/50 ${n.vinculoCodProj ? "bg-green-50/40" : ""}`}>
                          <td className="px-3 py-2 font-mono text-xs text-torg-blue whitespace-nowrap">{n.numero}/{n.serie}</td>
                          <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{fmtData(n.data)}</td>
                          <td className="px-3 py-2 text-gray-700 max-w-[160px] truncate" title={n.tomadorNome}>{n.tomadorNome || "—"}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {n.obra
                              ? <span className="text-xs px-1.5 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-600 font-medium" title="extraído da descrição">{n.obra}</span>
                              : <span className="text-xs text-gray-400">—</span>}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-amber-700 font-semibold whitespace-nowrap">{fmtMoeda(n.valor)}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <select
                                value={n.vinculoCodProj || ""}
                                disabled={salvando === chave}
                                onChange={e => vincular(n, e.target.value)}
                                className={`text-xs border rounded-lg px-2 py-1 max-w-[220px] focus:ring-2 focus:ring-torg-blue focus:border-torg-blue ${n.vinculoCodProj ? "border-green-300 bg-green-50 text-green-800" : "border-gray-300 text-torg-gray"}`}>
                                <option value="">— escolher obra —</option>
                                {projetos.map(p => <option key={p.codProj} value={p.codProj}>{p.nome}</option>)}
                              </select>
                              {salvando === chave
                                ? <Loader2 size={13} className="animate-spin text-gray-400" />
                                : n.vinculoCodProj ? <span className="text-green-600 text-xs">✓</span> : null}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-gray-600 max-w-[240px] truncate" title={n.descricao}>{n.descricao || "—"}</td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Th({ campo, label, align, ordenarPor, direcao, clicarOrdenar }) {
  const ativo = ordenarPor === campo;
  const just = align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";
  const txt = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  const Icon = !ativo ? ChevronsUpDown : direcao === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={`px-4 py-3 ${txt} text-xs font-medium uppercase whitespace-nowrap select-none`}>
      <button onClick={() => clicarOrdenar(campo)}
        className={`inline-flex items-center gap-1 ${just} w-full hover:text-torg-blue transition-colors ${ativo ? "text-torg-blue" : "text-gray-500"}`}>
        {label}
        <Icon size={13} className={ativo ? "opacity-100" : "opacity-40"} />
      </button>
    </th>
  );
}

function TagTipo({ tipo }) {
  const cor = tipo === "Venda+Serviço" ? "bg-teal-100 text-teal-700 border-teal-200"
    : tipo === "Serviço" ? "bg-purple-100 text-purple-700 border-purple-200"
    : tipo === "Avulsa" ? "bg-pink-100 text-pink-700 border-pink-200"
    : "bg-blue-100 text-blue-700 border-blue-200";
  const label = tipo === "Avulsa" ? "Só prefeitura" : tipo;
  return <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium whitespace-nowrap ${cor}`}>{label}</span>;
}

function FragmentObra({ obra, aberta, onToggle }) {
  return (
    <>
      <tr className={`hover:bg-gray-50 cursor-pointer ${obra.atrasado ? "bg-red-50/20" : ""}`} onClick={onToggle}>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-gray-400 transition-transform ${aberta ? "rotate-90" : ""}`}>▶</span>
            <span className="text-torg-dark font-medium">{obra.projeto}</span>
            <TagTipo tipo={obra.tipo} />
            {obra.faturadoAvulso > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full border bg-purple-50 text-purple-700 border-purple-200 inline-flex items-center gap-1"
                title={`Inclui ${fmtMoeda(obra.faturadoAvulso)} de ${obra.qtdAvulsas} NFS-e avulsa(s) da prefeitura vinculada(s)`}>
                <Landmark size={10} /> +{fmtMoeda(obra.faturadoAvulso)} avulsa
              </span>
            )}
            {obra.atrasado && <Clock size={13} className="text-red-500" />}
          </div>
        </td>
        <td className="px-4 py-3 text-right tabular-nums text-green-700 font-semibold whitespace-nowrap">{fmtMoeda(obra.faturado)}</td>
        <td className={`px-4 py-3 text-right tabular-nums font-semibold whitespace-nowrap ${obra.aFaturar > 0 ? "text-amber-700" : "text-gray-400"}`}>{fmtMoeda(obra.aFaturar)}</td>
        <td className="px-4 py-3 text-right tabular-nums text-torg-dark font-bold whitespace-nowrap">{fmtMoeda(obra.total)}</td>
        <td className="px-4 py-3">
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-xs font-semibold text-torg-dark">{obra.pctFaturado}%</span>
            <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-green-500 rounded-full" style={{ width: `${obra.pctFaturado}%` }} />
            </div>
          </div>
        </td>
      </tr>
      {aberta && obra.pedidos.map((ped) => (
        <tr key={ped.numero} className="bg-gray-50/40">
          <td colSpan={5} className="px-4 py-2">
            <div className="pl-6">
              <div className="text-xs font-semibold text-torg-gray mb-1 flex items-center gap-1.5 flex-wrap">
                <span className={`px-1.5 py-0.5 rounded text-[10px] ${ped.origem === "servico" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                  {ped.origem === "servico" ? "Serviço (OS)" : "Venda"}
                </span>
                #{ped.numero}
                {ped.nfs?.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-green-100 text-green-700 border border-green-200 font-medium"
                    title={`Nota(s) fiscal(is) emitida(s) para esta ${ped.origem === "servico" ? "OS" : "venda"}`}>
                    NF {ped.nfs.join(", ")}
                  </span>
                )}
                <span className="text-torg-gray font-normal">— {ped.parcelas.length} parcela(s) · faturado {fmtMoeda(ped.faturado)} · a faturar {fmtMoeda(ped.aFaturar)}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ped.parcelas.map((pc) => {
                  const cor = pc.situacao === "Cancelado" ? "bg-gray-100 text-gray-400 line-through border-gray-200"
                    : pc.situacao === "Encerrado" ? "bg-slate-100 text-slate-500 border-slate-300"
                    : pc.situacao === "Faturado" ? "bg-green-50 text-green-700 border-green-200"
                    : pc.atrasado ? "bg-red-50 text-red-700 border-red-200"
                    : "bg-amber-50 text-amber-700 border-amber-200";
                  return (
                    <span key={pc.codigoPedido} className={`text-[11px] px-2 py-0.5 rounded border ${cor}`}
                      title={`Seq ${pc.sequencial} — ${pc.situacao}${pc.encMotivo ? " · " + pc.encMotivo : ""}`}>
                      {ped.numero}/{pc.sequencial} · {fmtMoeda(pc.valor)} · {pc.situacao}
                    </span>
                  );
                })}
              </div>
            </div>
          </td>
        </tr>
      ))}
    </>
  );
}
