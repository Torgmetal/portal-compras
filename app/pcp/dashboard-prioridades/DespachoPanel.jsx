"use client";
// Painel da OP na TV do PCP — duas abas:
//   • Despachar → destina as peças EM ABERTO (Prioridade / Terceiro / Revisão / Aguardando / Cancelar).
//   • Baixa     → marca a peça como concluída NAQUELE setor (PecaConjunto.baixaSetores), SEM tocar no
//                 Syneco. A garantia do "extremo sincronismo" é a coluna Syneco do export (precisa
//                 dar baixa no Syneco = tem baixa no portal, mas o Syneco ainda não tem produção).
// Reusa /api/pcp/despacho (GET peças+placar+reconciliação, POST despacha / dá baixa).
import { useState, useEffect, useCallback, useMemo } from "react";
import { X, Loader2, Star, Truck, RotateCcw, Ban, Package, FileDown, FileUp, CheckCircle2, Undo2 } from "lucide-react";
import { criarRelatorioTorg, adicionarHeaderTabela, adicionarLinhaTabela, downloadWorkbook, CORES } from "@/lib/excel-relatorio";

const DESTINOS = [
  { key: "PRIORIDADE", label: "Prioridade", icon: Star, cor: "bg-amber-500 hover:bg-amber-600", desc: "libera p/ desenho e corte" },
  { key: "TERCEIRO", label: "Terceiro", icon: Truck, cor: "bg-indigo-600 hover:bg-indigo-700", desc: "terceiriza (vai p/ /pcp/terceirizados)" },
  { key: "REVISAO", label: "Revisão", icon: RotateCcw, cor: "bg-sky-600 hover:bg-sky-700", desc: "volta p/ engenharia revisar" },
  { key: "AGUARDANDO_MATERIAL", label: "Aguard. material", icon: Package, cor: "bg-slate-500 hover:bg-slate-600", desc: "trava esperando matéria-prima" },
  { key: "CANCELADA", label: "Cancelar", icon: Ban, cor: "bg-red-600 hover:bg-red-700", desc: "tira do escopo" },
];
const VOLTA = ["MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDICAO"];
const ROTULO = { ABERTO: "Em aberto", PRIORIDADE: "Prioridade", TERCEIRO: "Terceiro", REVISAO: "Revisão", AGUARDANDO_MATERIAL: "Aguard. material", CANCELADA: "Cancelada" };
const SETOR_LABEL = { CORTE: "Preparação", MONTAGEM: "Montagem", SOLDA: "Solda", ACABAMENTO: "Acabamento", JATO: "Jato", PINTURA: "Pintura", EXPEDICAO: "Expedição" };
// Só rotula o tipo quando a LPC marcou (CONJUNTO/CROQUI); null (ex.: guarda-corpo não tipado) NÃO vira "croqui".
const tipoLabel = (t) => (t === "CONJUNTO" ? "conjunto" : t === "CROQUI" ? "croqui" : null);
const statusLabel = (p) => (p.destino ? ROTULO[p.destino] || p.destino : p.status === "PENDENTE" ? "Em aberto" : p.status);

export default function DespachoPanel({ obra, setor, onClose, abaInicial = "despacho" }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [sel, setSel] = useState(() => new Set());
  const [enviando, setEnviando] = useState(false);
  const [terceiroVolta, setTerceiroVolta] = useState("MONTAGEM");
  const [aba, setAba] = useState(setor ? abaInicial : "despacho"); // "despacho" | "baixa"
  const [filtro, setFiltro] = useState("");
  const podeBaixa = !!setor;

  const carregar = useCallback(async () => {
    setLoading(true); setErro("");
    try {
      const r = await fetch(`/api/pcp/despacho?obra=${encodeURIComponent(obra)}${setor ? `&setor=${setor}` : ""}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
      setData(j); setSel(new Set());
    } catch (e) { setErro(e.message); } finally { setLoading(false); }
  }, [obra, setor]);
  useEffect(() => { carregar(); }, [carregar]);

  const abertas = useMemo(() => (data?.pecas || []).filter((p) => !p.destino && p.status === "PENDENTE"), [data]);
  // Aba Baixa: todas as peças do escopo, com filtro por marca/descrição.
  const lista = useMemo(() => {
    const todas = data?.pecas || [];
    const q = filtro.trim().toLowerCase();
    if (!q) return todas;
    return todas.filter((p) => `${p.marca} ${p.descricao || ""}`.toLowerCase().includes(q));
  }, [data, filtro]);
  const visiveis = aba === "despacho" ? abertas : lista;

  const toggle = (id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const todas = () => setSel((s) => (s.size === visiveis.length ? new Set() : new Set(visiveis.map((p) => p.id))));
  const trocaAba = (a) => { setAba(a); setSel(new Set()); };

  async function despachar(destino) {
    if (!sel.size) return;
    setEnviando(true);
    try {
      const body = { ids: [...sel], destino };
      if (destino === "TERCEIRO") body.destinoTerceirizado = terceiroVolta;
      const r = await fetch("/api/pcp/despacho", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
      await carregar();
    } catch (e) { alert(e.message); } finally { setEnviando(false); }
  }

  async function baixar(reverterBaixa) {
    if (!sel.size || !setor) return;
    setEnviando(true);
    try {
      const r = await fetch("/api/pcp/despacho", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [...sel], baixaSetor: setor, reverterBaixa }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
      await carregar();
    } catch (e) { alert(e.message); } finally { setEnviando(false); }
  }

  // Baixa em massa por planilha: lê a coluna "Peça"/"Marca" (e, se houver, uma coluna
  // "Baixa" S/N/X), casa a marca com as peças desta OP+setor e dá baixa no portal.
  async function importar(file) {
    if (!file || !setor) return;
    setEnviando(true);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer());
      const ws = wb.Sheets[wb.SheetNames[0]];
      const grid = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: "" });
      // Acha a linha de cabeçalho (Torg tem logo/título antes) e as colunas.
      let hRow = -1, cMarca = -1, cBaixa = -1;
      for (let r = 0; r < grid.length && hRow < 0; r++) {
        const row = (grid[r] || []).map((x) => String(x).trim().toLowerCase());
        const jm = row.findIndex((x) => x === "peça" || x === "peca" || x === "marca");
        if (jm >= 0) { hRow = r; cMarca = jm; cBaixa = row.findIndex((x) => x.includes("baixa")); }
      }
      if (hRow < 0) throw new Error('Não achei a coluna "Peça"/"Marca" na planilha.');
      const truthy = (v) => ["s", "sim", "x", "1", "true", "ok", "concluido", "concluído"].includes(String(v).trim().toLowerCase());
      const marcas = [];
      for (let r = hRow + 1; r < grid.length; r++) {
        const m = String(grid[r]?.[cMarca] ?? "").trim();
        if (!m) continue;
        if (cBaixa >= 0 && !truthy(grid[r]?.[cBaixa])) continue; // com coluna Baixa → só as marcadas
        marcas.push(m);
      }
      if (!marcas.length) throw new Error("Nenhuma peça para dar baixa na planilha.");
      const idx = new Map();
      for (const p of data?.pecas || []) idx.set(String(p.marca).trim().toUpperCase(), p.id);
      const ids = [], vistos = new Set(), naoAchou = [];
      for (const m of marcas) {
        const id = idx.get(m.toUpperCase());
        if (id) { if (!vistos.has(id)) { ids.push(id); vistos.add(id); } }
        else naoAchou.push(m);
      }
      if (!ids.length) throw new Error(`Nenhuma das ${marcas.length} marca(s) bate com peças desta OP/setor.`);
      const aviso = naoAchou.length ? `\n\n${naoAchou.length} não encontrada(s) na OP: ${naoAchou.slice(0, 8).join(", ")}${naoAchou.length > 8 ? "…" : ""}` : "";
      if (!confirm(`Dar baixa em ${ids.length} peça(s) de ${SETOR_LABEL[setor] || setor}?${aviso}`)) { setEnviando(false); return; }
      const r = await fetch("/api/pcp/despacho", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, baixaSetor: setor }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
      await carregar();
      alert(`Baixa aplicada em ${j.atualizados} peça(s).${naoAchou.length ? ` ${naoAchou.length} não encontradas.` : ""}`);
    } catch (e) { alert(e.message); } finally { setEnviando(false); }
  }

  // Coluna Syneco: "precisa dar baixa no Syneco ou não" (extremo sincronismo portal×Syneco).
  const synecoTxt = (p) => {
    if (!setor) return "—";
    if (!p.baixadoPortal) return "—";
    return p.precisaSyneco ? "SIM — dar baixa" : "OK — já no Syneco";
  };

  async function exportar() {
    const pecas = data?.pecas || [];
    const hoje = new Date().toISOString().split("T")[0];
    const nomeSetor = setor ? SETOR_LABEL[setor] || setor : "Geral";
    const headers = ["Peça", "Descrição", "Tipo", "Qtd", "Peso (kg)", "Status", `Baixa portal (${nomeSetor})`, "Syneco"];
    const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
      titulo: `Baixa de pecas — ${obra}${setor ? ` (${nomeSetor})` : ""}`,
      subtitulo: setor
        ? `Coluna Syneco = precisa dar baixa no Syneco (baixado no portal, sem producao no Syneco)`
        : `Lista de pecas da OP`,
      kpis: setor
        ? [`${pecas.length} pecas  |  Baixadas no portal: ${data?.baixados ?? 0}  |  Precisam Syneco: ${data?.precisamSyneco ?? 0}`]
        : [`${pecas.length} pecas`],
      totalColunas: headers.length,
      nomePlanilha: `Baixa ${obra}`.slice(0, 31),
      codigoDoc: "REL-PRD-005",
    });
    ws.columns = [{ width: 16 }, { width: 30 }, { width: 11 }, { width: 7 }, { width: 11 }, { width: 14 }, { width: 20 }, { width: 20 }];
    let row = linhaInicio;
    adicionarHeaderTabela(ws, row, headers); row++;
    for (const p of pecas) {
      const fill = !setor || !p.baixadoPortal ? undefined : p.precisaSyneco ? CORES.LIGHT_ORANGE : CORES.LIGHT_GREEN;
      adicionarLinhaTabela(ws, row, [
        p.marca, p.descricao || "", tipoLabel(p.tipoPeca) || "", p.qte ?? "",
        p.pesoTotalKg ? Math.round(p.pesoTotalKg) : "", statusLabel(p),
        p.baixadoPortal ? "Baixado" : "—", synecoTxt(p),
      ], { fillColor: fill, alinhamento: { 3: "center", 4: "right", 5: "center", 6: "center", 7: "center" } });
      row++;
    }
    await downloadWorkbook(workbook, `Torg_Baixa_${obra}${setor ? "_" + nomeSetor : ""}_${hoje}.xlsx`);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-white text-torg-dark rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold">{obra}{setor ? ` · ${SETOR_LABEL[setor] || setor}` : ""}</h2>
            {data && <p className="text-[12px] text-torg-gray">{data.placar.ABERTO} em aberto · {data.total} peça(s){setor === "CORTE" ? " no corte (sub-peças P + conjuntos solo)" : " no total"}{podeBaixa && data.baixados > 0 ? ` · ${data.baixados} baixadas` : ""}</p>}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={exportar} disabled={!data} title="Exportar a lista (com coluna Syneco)" className="text-[12px] font-semibold text-torg-blue border border-torg-blue-100 rounded-lg px-2.5 py-1 hover:bg-blue-50 disabled:opacity-40 inline-flex items-center gap-1"><FileDown size={13} /> Exportar</button>
            <button onClick={onClose} className="text-torg-gray hover:text-red-600"><X size={20} /></button>
          </div>
        </div>

        {/* Abas */}
        <div className="flex gap-1 px-5 pt-2 border-b border-gray-100">
          <button onClick={() => trocaAba("despacho")} className={`text-[13px] font-semibold px-3 py-1.5 rounded-t-lg ${aba === "despacho" ? "bg-torg-blue text-white" : "text-torg-gray hover:bg-gray-50"}`}>Despachar</button>
          <button onClick={() => trocaAba("baixa")} disabled={!podeBaixa} title={podeBaixa ? "" : "Abra por setor para dar baixa"} className={`text-[13px] font-semibold px-3 py-1.5 rounded-t-lg disabled:opacity-40 ${aba === "baixa" ? "bg-emerald-600 text-white" : "text-torg-gray hover:bg-gray-50"}`}>Baixa</button>
        </div>

        {data && aba === "despacho" && (
          <div className="flex flex-wrap gap-1.5 px-5 py-2 border-b border-gray-50 text-[11px]">
            {Object.entries(data.placar).filter(([, v]) => v > 0).map(([k, v]) => (
              <span key={k} className="bg-gray-100 rounded-full px-2 py-0.5 font-medium text-torg-dark">{ROTULO[k] || k}: {v}</span>
            ))}
          </div>
        )}
        {data && aba === "baixa" && (
          <div className="px-5 py-2 border-b border-gray-50">
            <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Filtrar por marca ou descrição…" className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-[13px]" />
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading && <div className="py-10 text-center text-torg-gray"><Loader2 className="mx-auto animate-spin" /></div>}
          {erro && <p className="text-red-600 text-sm">{erro}</p>}

          {/* Aba DESPACHO */}
          {!loading && !erro && aba === "despacho" && abertas.length === 0 && <p className="text-torg-gray text-sm text-center py-8">Nenhuma peça em aberto — tudo despachado. 🎉</p>}
          {!loading && aba === "despacho" && abertas.length > 0 && (
            <>
              <label className="flex items-center gap-2 text-[12px] font-semibold text-torg-gray mb-2 cursor-pointer">
                <input type="checkbox" checked={sel.size === abertas.length && abertas.length > 0} onChange={todas} /> Selecionar todas ({abertas.length})
              </label>
              <div className="space-y-0.5">
                {abertas.map((p) => (
                  <label key={p.id} className="flex items-center gap-2.5 text-[13px] px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} />
                    <span className="font-mono font-semibold shrink-0">{p.marca}</span>
                    {p.descricao && <span className="text-torg-gray text-[12px] truncate">{p.descricao}</span>}
                    {tipoLabel(p.tipoPeca) && <span className="text-torg-gray text-[11px] shrink-0 bg-gray-100 rounded px-1.5">{tipoLabel(p.tipoPeca)}</span>}
                    {p.qte > 1 && <span className="text-torg-gray text-[11px] shrink-0">×{p.qte}</span>}
                    {p.pesoTotalKg > 0 && <span className="text-torg-gray text-[11px] ml-auto shrink-0">{Math.round(p.pesoTotalKg)} kg</span>}
                  </label>
                ))}
              </div>
            </>
          )}

          {/* Aba BAIXA */}
          {!loading && !erro && aba === "baixa" && lista.length === 0 && <p className="text-torg-gray text-sm text-center py-8">Nenhuma peça{filtro ? " no filtro" : ""}.</p>}
          {!loading && aba === "baixa" && lista.length > 0 && (
            <>
              <label className="flex items-center gap-2 text-[12px] font-semibold text-torg-gray mb-2 cursor-pointer">
                <input type="checkbox" checked={sel.size === lista.length && lista.length > 0} onChange={todas} /> Selecionar {filtro ? `filtradas (${lista.length})` : `todas (${lista.length})`}
              </label>
              <div className="space-y-0.5">
                {lista.map((p) => (
                  <label key={p.id} className="flex items-center gap-2.5 text-[13px] px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} />
                    <span className="font-mono font-semibold shrink-0">{p.marca}</span>
                    {p.descricao && <span className="text-torg-gray text-[12px] truncate">{p.descricao}</span>}
                    {p.baixadoPortal && <span className="text-emerald-700 bg-emerald-50 text-[11px] shrink-0 rounded px-1.5 inline-flex items-center gap-0.5"><CheckCircle2 size={11} /> baixado</span>}
                    {p.baixadoPortal && (p.precisaSyneco
                      ? <span className="text-amber-700 bg-amber-50 text-[11px] shrink-0 rounded px-1.5" title="Baixado no portal, mas o Syneco ainda não tem produção">Syneco pendente</span>
                      : <span className="text-emerald-700 bg-emerald-50 text-[11px] shrink-0 rounded px-1.5">Syneco ok</span>)}
                    {p.pesoTotalKg > 0 && <span className="text-torg-gray text-[11px] ml-auto shrink-0">{Math.round(p.pesoTotalKg)} kg</span>}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Ações por aba */}
        {aba === "despacho" ? (
          <div className="border-t border-gray-100 px-5 py-3 space-y-2">
            <div className="flex items-center gap-2 text-[12px]">
              <span className="text-torg-gray">Volta do terceiro:</span>
              <select value={terceiroVolta} onChange={(e) => setTerceiroVolta(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1 text-[12px]">
                {VOLTA.map((v) => <option key={v} value={v}>{v[0] + v.slice(1).toLowerCase()}</option>)}
              </select>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {DESTINOS.map((d) => (
                <button key={d.key} onClick={() => despachar(d.key)} disabled={!sel.size || enviando} title={d.desc}
                  className={`text-[12px] font-semibold text-white rounded-lg px-3 py-2 inline-flex items-center gap-1.5 disabled:opacity-40 ${d.cor}`}>
                  <d.icon size={13} /> {d.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-torg-gray">{sel.size} selecionada(s) · o despacho é reversível na tela de cada destino.</p>
          </div>
        ) : (
          <div className="border-t border-gray-100 px-5 py-3 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => baixar(false)} disabled={!sel.size || enviando} title="Marca as peças como concluídas neste setor (no portal)"
                className="text-[12px] font-semibold text-white rounded-lg px-3 py-2 inline-flex items-center gap-1.5 disabled:opacity-40 bg-emerald-600 hover:bg-emerald-700">
                <CheckCircle2 size={13} /> Dar baixa em {setor ? SETOR_LABEL[setor] || setor : ""}
              </button>
              <button onClick={() => baixar(true)} disabled={!sel.size || enviando} title="Desfaz a baixa no portal"
                className="text-[12px] font-semibold text-torg-dark rounded-lg px-3 py-2 inline-flex items-center gap-1.5 disabled:opacity-40 bg-gray-100 hover:bg-gray-200">
                <Undo2 size={13} /> Reverter baixa
              </button>
              <label className={`text-[12px] font-semibold text-torg-blue border border-torg-blue-100 rounded-lg px-3 py-2 inline-flex items-center gap-1.5 ${enviando ? "opacity-40 pointer-events-none" : "hover:bg-blue-50 cursor-pointer"}`} title="Dá baixa em massa a partir de uma planilha (coluna Peça/Marca)">
                <FileUp size={13} /> Importar planilha
                <input type="file" accept=".xlsx,.xls,.csv" className="hidden" disabled={enviando}
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importar(f); }} />
              </label>
            </div>
            <p className="text-[11px] text-torg-gray">{sel.size} selecionada(s) · a baixa é só no portal. A coluna <b>Syneco</b> do export mostra o que ainda precisa dar baixa no Syneco.</p>
          </div>
        )}
      </div>
    </div>
  );
}
