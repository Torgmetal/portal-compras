"use client";
import { useState, useMemo, useEffect } from "react";
import {
  ArrowDownCircle, RefreshCw, Loader2, AlertCircle, Search, Clock,
  CalendarDays, ChevronDown, ChevronRight, Tag, Building2, ExternalLink, Check, FileSpreadsheet,
} from "lucide-react";

// Módulo Compras do Omie (tenant Torg). O Omie não expõe API/URL estável para
// abrir um pedido/NF específico (ObterImpressaoPedCompra não existe e a chave
// NFe vem vazia na maioria), então o clique copia o número e abre o módulo —
// o usuário cola na busca do Omie.
const OMIE_TENANT = process.env.NEXT_PUBLIC_OMIE_TENANT || "torg-5mos4yik";
const OMIE_COMPRAS_URL = `https://app.omie.com.br/gestao/${OMIE_TENANT}/#COM`;

const fmtMoeda = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtData = (iso) => iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";

function rangeHoje() { const d = new Date(); return { de: toISO(d), ate: toISO(d) }; }
function rangeSemana() {
  const d = new Date(); const dow = (d.getDay() + 6) % 7; // 0 = segunda
  const seg = new Date(d); seg.setDate(d.getDate() - dow);
  const dom = new Date(seg); dom.setDate(seg.getDate() + 6);
  return { de: toISO(seg), ate: toISO(dom) };
}
function rangeMes() {
  const d = new Date();
  return { de: toISO(new Date(d.getFullYear(), d.getMonth(), 1)), ate: toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
}

const SIT_COR = {
  "VENCIDA":  "bg-red-50 text-red-700 border-red-200",
  "A VENCER": "bg-amber-50 text-amber-700 border-amber-200",
  "PAGA":     "bg-green-50 text-green-700 border-green-200",
  "CANCELADA":"bg-gray-100 text-gray-400 border-gray-200 line-through",
};

export default function ContasPagarClient() {
  const [data, setData]   = useState(null);
  const [loading, setLoad] = useState(false);
  const [sincronizando, setSinc] = useState(false);
  const [erro, setErro]   = useState("");
  const hojeR = rangeHoje();
  const [de, setDe]   = useState(hojeR.de);
  const [ate, setAte] = useState(hojeR.ate);
  const [presetAtivo, setPreset] = useState("hoje");
  const [busca, setBusca] = useState("");
  const [filtroSit, setFiltroSit] = useState(""); // "" | VENCIDA | A VENCER | HOJE
  const [verResumo, setVerResumo] = useState(false);
  const [exportando, setExportando] = useState(false);

  const carregar = async (d1 = de, d2 = ate) => {
    setLoad(true); setErro("");
    try {
      const qs = new URLSearchParams({ de: d1, ate: d2 });
      const res = await fetch(`/api/financeiro/contas-pagar?${qs}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Erro");
      setData(j);
      return j;
    } catch (e) { setErro(e.message); return null; } finally { setLoad(false); }
  };

  // Ao abrir: mostra o cache na hora e, se o último sync for > 5 min, atualiza em background.
  useEffect(() => {
    (async () => {
      const j = await carregar(hojeR.de, hojeR.ate);
      const idadeMin = j?.ultimoSync ? (Date.now() - new Date(j.ultimoSync).getTime()) / 60000 : Infinity;
      if (idadeMin > 5) sincronizar(false);
    })();
    /* eslint-disable-next-line */
  }, []);

  const aplicarPreset = (p) => {
    const r = p === "hoje" ? rangeHoje() : p === "semana" ? rangeSemana() : rangeMes();
    setPreset(p); setDe(r.de); setAte(r.ate); carregar(r.de, r.ate);
  };

  // Sincroniza do Omie (incremental) e recarrega. manual=false é o auto ao abrir (silencioso em erro).
  const sincronizar = async (manual = true) => {
    setSinc(true); if (manual) setErro("");
    try {
      await fetch("/api/cron/contas-pagar");
      await carregar();
    } catch (e) { if (manual) setErro("Falha ao atualizar: " + e.message); } finally { setSinc(false); }
  };

  const contas = data?.contas || [];
  const hojeStr = toISO(new Date());

  const filtradas = useMemo(() => {
    let base = contas;
    if (filtroSit === "HOJE") base = base.filter((c) => c.vencimento?.slice(0, 10) === hojeStr && c.aberta);
    else if (filtroSit) base = base.filter((c) => c.situacao === filtroSit);
    const t = busca.trim().toLowerCase();
    if (t) base = base.filter((c) =>
      [c.fornecedor, c.categoria, c.nf, c.numeroDocumento, c.pedidoCompra, c.observacao]
        .some((x) => (x || "").toLowerCase().includes(t)));
    return base;
  }, [contas, filtroSit, busca, hojeStr]);

  const totais = useMemo(() => {
    const sum = (arr) => arr.reduce((s, c) => s + (c.valor || 0), 0);
    const abertas = filtradas.filter((c) => c.aberta);
    const vencidas = abertas.filter((c) => c.situacao === "VENCIDA");
    const venceHoje = abertas.filter((c) => c.vencimento?.slice(0, 10) === hojeStr);
    const aVencer = abertas.filter((c) => c.situacao === "A VENCER");
    return {
      total: sum(abertas), qtd: abertas.length,
      vencidas: sum(vencidas), qtdVencidas: vencidas.length,
      venceHoje: sum(venceHoje), qtdVenceHoje: venceHoje.length,
      aVencer: sum(aVencer), qtdAVencer: aVencer.length,
    };
  }, [filtradas, hojeStr]);

  const resumoPor = (campo) => {
    const map = new Map();
    const add = (k, valor) => { const cur = map.get(k) || { valor: 0, qtd: 0 }; cur.valor += valor || 0; cur.qtd++; map.set(k, cur); };
    for (const c of filtradas.filter((x) => x.aberta)) {
      // Título rateado: distribui o valor entre TODAS as categorias do rateio
      // (cada uma recebe a sua fatia), em vez de jogar tudo em uma só.
      if (campo === "categoria" && Array.isArray(c.rateio) && c.rateio.length > 1) {
        for (const r of c.rateio) add(r.nome || r.codigo || "(sem)", r.valor || 0);
      } else {
        add(c[campo] || "(sem)", c.valor || 0);
      }
    }
    return [...map.entries()].map(([k, v]) => ({ k, ...v })).sort((a, b) => b.valor - a.valor).slice(0, 12);
  };

  // Exporta a lista filtrada para Excel, no template ISO 9001 da Torg.
  const exportarXlsx = async () => {
    if (!data || filtradas.length === 0) return;
    setExportando(true);
    try {
      const {
        criarRelatorioTorg, adicionarHeaderTabela, adicionarLinhaTabela,
        adicionarLinhaTotais, downloadWorkbook,
      } = await import("@/lib/excel-relatorio");

      const totalColunas = 9;
      const subtitulo = [
        `Período: ${fmtData(de + "T12:00")} a ${fmtData(ate + "T12:00")}`,
        filtroSit && `Situação: ${filtroSit === "HOJE" ? "Vence hoje" : filtroSit}`,
        busca.trim() && `Busca: "${busca.trim()}"`,
      ].filter(Boolean).join("   |   ");

      const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
        titulo: "Contas a Pagar",
        subtitulo,
        nomePlanilha: "Contas a Pagar",
        codigoDoc: "REL-FIN-001",
        totalColunas,
        kpis: [
          `Total a pagar: ${fmtMoeda(totais.total)} (${totais.qtd} títulos)   |   Vencidas: ${fmtMoeda(totais.vencidas)} (${totais.qtdVencidas})   |   Vence hoje: ${fmtMoeda(totais.venceHoje)} (${totais.qtdVenceHoje})   |   A vencer: ${fmtMoeda(totais.aVencer)} (${totais.qtdAVencer})`,
        ],
      });

      const colWidths = [12, 32, 15, 24, 12, 12, 8, 12, 34];
      colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

      let row = linhaInicio;
      adicionarHeaderTabela(ws, row, ["Vencimento", "Fornecedor", "Valor (R$)", "Categoria", "NF", "Pedido", "Parc.", "Situação", "Observação"]);
      row++;
      const dataIni = row;

      let soma = 0;
      filtradas.forEach((c, idx) => {
        soma += c.valor || 0;
        const valores = [
          fmtData(c.vencimento), c.fornecedor || "—", Number((c.valor || 0).toFixed(2)),
          c.categoria || "—", c.nf || "—", c.pedidoCompra || "—", c.parcela || "—",
          c.situacao || "—", c.observacao || "",
        ];
        const fontColors = c.situacao === "VENCIDA" ? { 7: "D32F2F" } : {};
        adicionarLinhaTabela(ws, row, valores, {
          fillColor: idx % 2 === 1 ? "F8FAFC" : undefined,
          alinhamento: { 2: "right", 6: "center", 7: "center" }, fontColors, fontSize: 9, rowHeight: 16,
        });
        ws.getCell(row, 3).numFmt = "#,##0.00";
        row++;
      });

      const dataFim = row - 1;
      // Filtro nas colunas (o usuário pediu pra sempre vir com filtro).
      ws.autoFilter = { from: { row: linhaInicio, column: 1 }, to: { row: dataFim, column: totalColunas } };

      // Total com SUBTOTAL: soma correta e que respeita o filtro aplicado.
      adicionarLinhaTotais(ws, row, ["", "TOTAL", { formula: `SUBTOTAL(9,C${dataIni}:C${dataFim})`, result: Number(soma.toFixed(2)) }, "", "", "", "", "", `${filtradas.length} títulos`]);
      ws.getCell(row, 3).numFmt = "#,##0.00";
      ws.views = [{ state: "frozen", ySplit: linhaInicio }];

      await downloadWorkbook(workbook, `Contas_a_Pagar_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) {
      console.error("Erro ao exportar:", e);
      setErro("Erro ao gerar planilha: " + e.message);
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2">
            <ArrowDownCircle size={26} className="text-torg-blue" /> Contas a Pagar
          </h2>
          <p className="text-sm text-torg-gray mt-1">
            Títulos a pagar do Omie por vencimento.
            {data?.ultimoSync && ` Sincronizado ${fmtData(data.ultimoSync)} ${new Date(data.ultimoSync).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportarXlsx} disabled={exportando || loading || !data || filtradas.length === 0}
            title="Exportar a lista filtrada para Excel"
            className="px-3 py-2 text-sm border border-gray-300 text-torg-gray rounded-lg hover:bg-gray-50 inline-flex items-center gap-2 disabled:opacity-50">
            {exportando ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} className="text-emerald-600" />}
            {exportando ? "Gerando…" : "Extrair relatório"}
          </button>
          <button onClick={() => sincronizar(true)} disabled={sincronizando || loading}
            className="px-3 py-2 text-sm border border-gray-300 text-torg-gray rounded-lg hover:bg-gray-50 inline-flex items-center gap-2 disabled:opacity-50">
            {sincronizando ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {sincronizando ? "Atualizando…" : "Atualizar"}
          </button>
        </div>
      </div>

      {/* Presets de período */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3 flex-wrap">
        <CalendarDays size={16} className="text-torg-gray" />
        {[["hoje", "Hoje"], ["semana", "Esta semana"], ["mes", "Este mês"]].map(([p, label]) => (
          <button key={p} onClick={() => aplicarPreset(p)}
            className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${presetAtivo === p ? "bg-torg-blue text-white border-torg-blue" : "bg-white text-torg-gray border-gray-200 hover:bg-gray-50"}`}>
            {label}
          </button>
        ))}
        <span className="text-gray-300">|</span>
        <input type="date" value={de} max={ate} onChange={(e) => { setDe(e.target.value); setPreset(""); }}
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-torg-blue" />
        <span className="text-gray-400 text-sm">até</span>
        <input type="date" value={ate} min={de} onChange={(e) => { setAte(e.target.value); setPreset(""); }}
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-torg-blue" />
        <button onClick={() => carregar()} disabled={loading}
          className="px-2.5 py-1.5 bg-torg-blue text-white rounded-lg text-sm inline-flex items-center gap-1 hover:opacity-90 disabled:opacity-50">
          {loading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />} Buscar
        </button>
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5 shrink-0" /> <span>{erro}</span>
        </div>
      )}

      {/* KPIs (clicáveis = filtro) */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <KpiCard label="Total a pagar" valor={totais.total} sub={`${totais.qtd} títulos`} cor="torg-blue"
            ativo={filtroSit === ""} onClick={() => setFiltroSit("")} />
          <KpiCard label="Vencidas" valor={totais.vencidas} sub={`${totais.qtdVencidas} títulos`} cor="red"
            ativo={filtroSit === "VENCIDA"} onClick={() => setFiltroSit(filtroSit === "VENCIDA" ? "" : "VENCIDA")} />
          <KpiCard label="Vence hoje" valor={totais.venceHoje} sub={`${totais.qtdVenceHoje} títulos`} cor="amber"
            ativo={filtroSit === "HOJE"} onClick={() => setFiltroSit(filtroSit === "HOJE" ? "" : "HOJE")} />
          <KpiCard label="A vencer" valor={totais.aVencer} sub={`${totais.qtdAVencer} títulos`} cor="green"
            ativo={filtroSit === "A VENCER"} onClick={() => setFiltroSit(filtroSit === "A VENCER" ? "" : "A VENCER")} />
        </div>
      )}

      {/* Busca + resumo toggle */}
      {data && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[240px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar fornecedor, NF, categoria, pedido, observação…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue" />
          </div>
          <button onClick={() => setVerResumo((v) => !v)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg text-torg-gray hover:bg-gray-50 inline-flex items-center gap-1.5">
            {verResumo ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Resumos por categoria/fornecedor
          </button>
        </div>
      )}

      {/* Resumos */}
      {data && verResumo && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ResumoCard titulo="Por categoria" icone={Tag} itens={resumoPor("categoria")} />
          <ResumoCard titulo="Por fornecedor" icone={Building2} itens={resumoPor("fornecedor")} />
        </div>
      )}

      {/* Tabela */}
      {loading && !data ? (
        <div className="flex items-center justify-center gap-2 py-16 text-torg-gray">
          <Loader2 size={20} className="animate-spin" /> Carregando…
        </div>
      ) : data && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 text-sm text-torg-dark flex items-center justify-between flex-wrap gap-2">
            <span><strong>{filtradas.length}</strong> títulos · {fmtMoeda(totais.total)} em aberto</span>
            <span className="text-xs text-torg-gray">Período {fmtData(de + "T12:00")} → {fmtData(ate + "T12:00")}</span>
          </div>
          {filtradas.length === 0 ? (
            <div className="py-12 text-center text-torg-gray text-sm">Nenhum título no filtro.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50/60 border-b border-gray-100">
                  <tr>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Vencimento</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Fornecedor</th>
                    <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Valor</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Categoria</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">NF</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Pedido</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Parc.</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Situação</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Observação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtradas.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50/50">
                      <td className="px-3 py-2 whitespace-nowrap text-torg-dark font-medium">
                        {fmtData(c.vencimento)}
                        {c.diasAtraso > 0 && <span className="ml-1 text-[10px] text-red-600">({c.diasAtraso}d)</span>}
                      </td>
                      <td className="px-3 py-2 text-gray-700 max-w-[200px] truncate" title={c.fornecedor}>{c.fornecedor}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-torg-dark whitespace-nowrap">{fmtMoeda(c.valor)}</td>
                      <td className="px-3 py-2 text-gray-600 max-w-[180px] truncate" title={Array.isArray(c.rateio) ? c.rateio.map((r) => `${r.nome || r.codigo}: ${(r.valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`).join("  ·  ") : (c.categoria || "")}>
                        {Array.isArray(c.rateio) ? c.rateio.map((r) => r.nome || r.codigo).join(" / ") : (c.categoria || "—")}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap"><OmieCell valor={c.nf} copiar={c.chaveNfe || c.nf} rotulo="NF" /></td>
                      <td className="px-3 py-2 whitespace-nowrap"><OmieCell valor={c.pedidoCompra} copiar={c.pedidoCompra} rotulo="Pedido" /></td>
                      <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{c.parcela || "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${SIT_COR[c.situacao] || "bg-gray-100 text-gray-600 border-gray-200"}`}>
                          {c.situacao}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-500 text-xs max-w-[220px] truncate" title={c.observacao}>{c.observacao || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Célula clicável de NF / Pedido: copia o número (ou a chave NFe) e abre o
// módulo Compras do Omie em nova aba, pra colar na busca.
function OmieCell({ valor, copiar, rotulo }) {
  const [copiado, setCopiado] = useState(false);
  if (!valor) return <span className="text-gray-400 text-xs">—</span>;
  const onClick = () => {
    try { navigator.clipboard?.writeText(String(copiar || valor)); } catch { /* sem clipboard */ }
    setCopiado(true); setTimeout(() => setCopiado(false), 1500);
    window.open(OMIE_COMPRAS_URL, "_blank", "noopener,noreferrer");
  };
  return (
    <button onClick={onClick} title={`Copiar ${rotulo} ${copiar || valor} e abrir o Omie`}
      className="font-mono text-xs text-torg-blue hover:underline inline-flex items-center gap-1">
      {valor}
      {copiado ? <Check size={11} className="text-green-600" /> : <ExternalLink size={10} className="opacity-50" />}
    </button>
  );
}

function KpiCard({ label, valor, sub, cor, ativo, onClick }) {
  const borda = { "torg-blue": "border-torg-blue-100", red: "border-red-100", amber: "border-amber-100", green: "border-green-100" }[cor];
  const txt = { "torg-blue": "text-torg-blue", red: "text-red-700", amber: "text-amber-700", green: "text-green-700" }[cor];
  return (
    <button onClick={onClick}
      className={`text-left bg-white rounded-xl shadow-sm border p-4 transition-all ${borda} ${ativo ? "ring-2 ring-torg-blue" : "hover:shadow"}`}>
      <p className="text-xs text-torg-gray">{label}</p>
      <p className={`text-xl font-extrabold tabular-nums mt-1 ${txt}`}>{fmtMoeda(valor)}</p>
      <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>
    </button>
  );
}

function ResumoCard({ titulo, icone: Icon, itens }) {
  const max = Math.max(...itens.map((i) => i.valor), 1);
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <p className="text-sm font-semibold text-torg-dark flex items-center gap-1.5 mb-3"><Icon size={14} className="text-torg-blue" /> {titulo}</p>
      <div className="space-y-1.5">
        {itens.map((i) => (
          <div key={i.k} className="flex items-center gap-2 text-xs">
            <span className="flex-1 min-w-0 truncate text-torg-dark" title={i.k}>{i.k}</span>
            <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden shrink-0">
              <div className="h-full bg-torg-blue rounded-full" style={{ width: `${(i.valor / max) * 100}%` }} />
            </div>
            <span className="tabular-nums font-semibold text-torg-dark w-24 text-right">{fmtMoeda(i.valor)}</span>
            <span className="text-gray-400 w-8 text-right">{i.qtd}</span>
          </div>
        ))}
        {itens.length === 0 && <p className="text-xs text-torg-gray">Sem dados no filtro.</p>}
      </div>
    </div>
  );
}
