"use client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useStore } from "@/lib/store";
import { Loader2, Plus, ClipboardPaste, Save, Trash2, Search, Check, X, PackagePlus, Filter, ChevronDown, ArrowUp, ArrowDown, FileDown } from "lucide-react";

const anoAtual = new Date().getFullYear();
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const fmtNum = (v) => (v == null || v === "" ? "—" : Number(v).toLocaleString("pt-BR"));
// R/RC é guardado no início da observação como "Tipo: R" — separa pra exibir na coluna própria.
function parseObs(observacao) {
  const s = String(observacao || "");
  const m = s.match(/^Tipo:\s*(RC|R)\b\s*(\|\s*)?/i);
  if (!m) return { rc: "", obs: s };
  return { rc: m[1].toUpperCase(), obs: s.slice(m[0].length).trim() };
}
const inp = "w-full text-sm border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-torg-blue outline-none";
const lbl = "block text-[11px] font-medium text-torg-gray uppercase tracking-wide mb-1";

const VAZIO = { rc: "R", descricao: "", especificacao: "", certificado: "", loteCorrida: "", pedidoCompra: "", dataRecebimento: "", nf: "", fornecedor: "", obra: "", qtd: "", pesoLitro: "", observacao: "" };
// Ordem das colunas ao COLAR do Excel (igual à planilha CMR; o índice R é automático).
const COLS_MASSA = ["rc", "_indice", "descricao", "certificado", "loteCorrida", "especificacao", "pedidoCompra", "dataRecebimento", "nf", "fornecedor", "obra", "qtd", "pesoLitro", "observacao"];

const VAZIA = "(vazias)";
// Colunas da tabela (filtro/ordenação estilo Excel). `get` devolve o valor de exibição.
const COLUNAS = [
  { key: "rc", label: "R/RC", get: (l) => l.rc },
  { key: "importRef", label: "Índice R", get: (l) => l.importRef, num: true },
  { key: "nome", label: "Descrição do material", get: (l) => l.nome, w: 320 },
  { key: "cert", label: "Nº certificado", get: (l) => (l.certOk ? l.numeroDocumento : "") },
  { key: "corrida", label: "Lote / corrida", get: (l) => l.numeroCorrida || "" },
  { key: "norma", label: "Especificação", get: (l) => l.norma || "" },
  { key: "pedido", label: "Pedido compra", get: (l) => l.pedidoCompra || "" },
  { key: "data", label: "Data receb.", get: (l) => l.dataFmt },
  { key: "nf", label: "Nº NF", get: (l) => l.nfNumero || "" },
  { key: "fornecedor", label: "Fornecedor", get: (l) => l.fornecedor || "" },
  { key: "obra", label: "Obra", get: (l) => l.opNumero || "" },
  { key: "qtd", label: "Qtd pçs", get: (l) => l.quantidade ?? "", num: true, align: "right" },
  { key: "peso", label: "Peso/litro", get: (l) => l.pesoKg ?? "", num: true, align: "right" },
  { key: "obs", label: "Observação", get: (l) => l.obs || "", w: 200 },
];
const valorCol = (col, l) => { const v = col.get(l); return v == null || v === "" ? VAZIA : String(v); };

export default function CmrLancarClient() {
  const { showToast } = useStore();
  const [ano, setAno] = useState(anoAtual);
  const [dados, setDados] = useState(null);
  const [anos, setAnos] = useState([anoAtual]);
  const [busca, setBusca] = useState("");
  const [modo, setModo] = useState(null); // null | "form" | "massa"
  const [form, setForm] = useState(VAZIO);
  const [massa, setMassa] = useState([]); // linhas coladas (array de objetos)
  const [salvando, setSalvando] = useState(false);
  const [pedido, setPedido] = useState(null); // itens puxados do pedido de compra
  const [buscandoPed, setBuscandoPed] = useState(false);
  const [filtros, setFiltros] = useState({}); // { colKey: Set(valores) }
  const [ordenar, setOrdenar] = useState(null); // { key, dir }
  const [filtroAberto, setFiltroAberto] = useState(null); // { key, rect }

  // Normaliza cada item p/ o filtro/ordenação (rc derivado, cert, data formatada).
  const linhas = useMemo(() => (dados?.itens || []).map((it) => {
    const { rc: rcSalvo, obs } = parseObs(it.observacao);
    const rc = rcSalvo || (Number(it.pesoKg) > 0 ? "R" : Number(it.quantidade) > 0 ? "RC" : "R");
    return { ...it, rc, obs, certOk: !!(it.numeroDocumento && String(it.numeroDocumento).trim()), dataFmt: fmtData(it.dataRecebimento) };
  }), [dados]);

  const passa = useCallback((l, exceto) => {
    for (const col of COLUNAS) {
      if (col.key === exceto) continue;
      const sel = filtros[col.key];
      if (sel && !sel.has(valorCol(col, l))) return false;
    }
    return true;
  }, [filtros]);

  const visiveis = useMemo(() => {
    let arr = linhas.filter((l) => passa(l, null));
    if (ordenar) {
      const col = COLUNAS.find((c) => c.key === ordenar.key);
      arr = [...arr].sort((a, b) => {
        let x = col.get(a), y = col.get(b);
        if (col.num) { x = Number(x) || 0; y = Number(y) || 0; return ordenar.dir === "asc" ? x - y : y - x; }
        x = String(x || ""); y = String(y || "");
        return ordenar.dir === "asc" ? x.localeCompare(y, "pt-BR") : y.localeCompare(x, "pt-BR");
      });
    }
    return arr;
  }, [linhas, passa, ordenar]);

  const distintos = useCallback((colKey) => {
    const col = COLUNAS.find((c) => c.key === colKey);
    const set = new Set();
    for (const l of linhas) if (passa(l, colKey)) set.add(valorCol(col, l));
    return [...set].sort((a, b) => (col.num ? (Number(a) || 0) - (Number(b) || 0) : String(a).localeCompare(String(b), "pt-BR")));
  }, [linhas, passa]);

  const carregar = useCallback(async () => {
    const p = new URLSearchParams({ ano: String(ano) });
    if (busca.trim()) p.set("q", busca.trim());
    const r = await fetch(`/api/compras/cmr?${p}`).then((x) => x.json()).catch(() => null);
    if (r?.success) { setDados(r); if (r.anos?.length) setAnos(r.anos); }
  }, [ano, busca]);
  useEffect(() => { const t = setTimeout(carregar, 250); return () => clearTimeout(t); }, [carregar]);

  const setF = (k, v) => setForm((s) => ({ ...s, [k]: v }));

  async function puxarPedido() {
    const num = (form.pedidoCompra || "").trim();
    if (!num) { showToast("Digite o nº do pedido de compra", "erro"); return; }
    setBuscandoPed(true); setPedido(null);
    try {
      const j = await fetch(`/api/compras/cmr/pedido?numero=${encodeURIComponent(num)}`).then((r) => r.json());
      if (!j.success) throw new Error(j.error || "Pedido não encontrado");
      setPedido(j);
      // preenche fornecedor/obra/NF do pedido de uma vez
      setForm((s) => ({ ...s, fornecedor: j.fornecedor || s.fornecedor, obra: (j.obra || s.obra || "").replace(/^OP\s*/i, "OP "), nf: j.nf || s.nf }));
    } catch (e) { showToast(e.message, "erro"); } finally { setBuscandoPed(false); }
  }
  function escolherItemPedido(it) {
    setForm((s) => ({ ...s, descricao: it.descricao, qtd: it.qtd ? String(it.qtd) : s.qtd }));
  }

  async function salvarForm() {
    if (!form.descricao.trim()) { showToast("Informe a descrição do material", "erro"); return; }
    setSalvando(true);
    try {
      const r = await fetch("/api/compras/cmr", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ano, lancamentos: [form] }) });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Erro");
      showToast(`Lançado — índice R ${j.indices?.[0] || ""}`, "success");
      setForm({ ...VAZIO, rc: form.rc, obra: form.obra, fornecedor: form.fornecedor, dataRecebimento: form.dataRecebimento, nf: form.nf }); // mantém campos repetitivos
      carregar();
    } catch (e) { showToast(e.message, "erro"); } finally { setSalvando(false); }
  }

  function colar(texto) {
    const linhas = texto.split(/\r?\n/).map((l) => l).filter((l) => l.trim());
    const parsed = linhas.map((l) => {
      const cels = l.split("\t");
      const o = {};
      COLS_MASSA.forEach((c, i) => { if (c !== "_indice") o[c] = (cels[i] || "").trim(); });
      return o;
    }).filter((o) => o.descricao);
    setMassa(parsed);
  }
  async function salvarMassa() {
    const validos = massa.filter((m) => m.descricao?.trim());
    if (!validos.length) { showToast("Cole linhas com descrição preenchida", "erro"); return; }
    setSalvando(true);
    try {
      const r = await fetch("/api/compras/cmr", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ano, lancamentos: validos }) });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Erro");
      showToast(`${j.criados} lançamento(s) gravados (${j.indices?.[0]}…${j.indices?.[j.indices.length - 1]})`, "success");
      setMassa([]); setModo(null); carregar();
    } catch (e) { showToast(e.message, "erro"); } finally { setSalvando(false); }
  }

  const itens = dados?.itens || [];

  // Exporta pra .xlsx o que está VISÍVEL (respeita filtros/ordenação/busca) — todas as colunas da planilha.
  const [exportando, setExportando] = useState(false);
  async function exportarExcel() {
    if (!visiveis.length) { showToast("Nada para exportar", "erro"); return; }
    setExportando(true);
    try {
      const XLSX = await import("xlsx");
      const header = COLUNAS.map((c) => c.label);
      const rows = visiveis.map((l) => COLUNAS.map((c) => {
        const v = c.get(l);
        if (v == null || v === "") return "";
        return c.num ? Number(v) : String(v);
      }));
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
      ws["!cols"] = COLUNAS.map((c) => ({ wch: c.w ? Math.min(70, Math.round(c.w / 6.5)) : Math.max(11, c.label.length + 3) }));
      ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: COLUNAS.length - 1 } }) };
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `CMR ${ano}`);
      XLSX.writeFile(wb, `CMR-TORG-${ano}.xlsx`);
    } catch (e) { showToast("Falha ao gerar Excel: " + e.message, "erro"); } finally { setExportando(false); }
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-torg-dark flex items-center gap-2"><PackagePlus size={22} className="text-torg-blue" /> Recebimentos (CMR)</h1>
          <p className="text-[12px] text-torg-gray mt-0.5">Lançamento de matéria-prima recebida — controle de materiais rastreáveis, por ano.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={ano} onChange={(e) => setAno(Number(e.target.value))} className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-torg-blue">
            {[...new Set([anoAtual, ...anos])].sort((a, b) => b - a).map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {/* Ações de lançamento */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => { setModo(modo === "form" ? null : "form"); setForm(VAZIO); }}
          className={`text-sm font-medium rounded-lg px-4 py-2.5 inline-flex items-center gap-2 ${modo === "form" ? "bg-torg-blue text-white" : "bg-white border border-torg-blue-200 text-torg-blue hover:bg-torg-blue-50"}`}>
          <Plus size={16} /> Lançar item (celular)
        </button>
        <button onClick={() => { setModo(modo === "massa" ? null : "massa"); setMassa([]); }}
          className={`text-sm font-medium rounded-lg px-4 py-2.5 inline-flex items-center gap-2 ${modo === "massa" ? "bg-torg-blue text-white" : "bg-white border border-torg-blue-200 text-torg-blue hover:bg-torg-blue-50"}`}>
          <ClipboardPaste size={16} /> Colar várias linhas (Excel)
        </button>
      </div>

      {/* Formulário 1 item (celular) */}
      {modo === "form" && (
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-4 space-y-3">
          {pedido && (
            <div className="border border-torg-blue-100 bg-torg-blue-50/40 rounded-lg overflow-hidden">
              <div className="px-3 py-2 flex items-center justify-between">
                <p className="text-[12px] font-semibold text-torg-dark">Pedido {pedido.pedido} · {pedido.fornecedor || "—"}{pedido.obra ? ` · ${pedido.obra}` : ""} <span className="font-normal text-torg-gray">— toque no item que chegou</span></p>
                <button onClick={() => setPedido(null)} className="text-torg-gray hover:text-red-600"><X size={15} /></button>
              </div>
              <div className="max-h-44 overflow-y-auto divide-y divide-torg-blue-100/60">
                {pedido.itens.length === 0 ? <p className="px-3 py-2 text-xs text-torg-gray">Pedido sem itens.</p>
                  : pedido.itens.map((it) => {
                    const escolhido = form.descricao === it.descricao;
                    return (
                      <button key={it.idx} type="button" onClick={() => escolherItemPedido(it)}
                        className={`w-full text-left px-3 py-2 text-xs hover:bg-white/70 flex items-center gap-2 ${escolhido ? "bg-white" : ""}`}>
                        <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${escolhido ? "bg-torg-blue border-torg-blue" : "border-gray-300"}`}>{escolhido && <Check size={11} className="text-white" />}</span>
                        <span className="flex-1 min-w-0"><span className="text-torg-dark block truncate">{it.descricao}</span>
                          <span className="text-torg-gray">{fmtNum(it.qtd)} {it.unidade || ""}{it.qtdRecebida > 0 ? ` · já receb. ${fmtNum(it.qtdRecebida)}` : ""}</span></span>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div><span className={lbl}>R / RC</span>
              <div className="flex gap-1">
                {["R", "RC"].map((t) => <button key={t} type="button" onClick={() => setF("rc", t)} className={`flex-1 py-2.5 rounded-lg text-sm font-medium border ${form.rc === t ? "bg-torg-blue text-white border-torg-blue" : "border-gray-300 text-torg-dark"}`}>{t}</button>)}
              </div>
            </div>
            <div className="col-span-2 sm:col-span-3"><span className={lbl}>Descrição do material *</span>
              <Autocomplete campo="descricao" value={form.descricao} onChange={(v) => setF("descricao", v)} placeholder="ex.: PERFIL W ACO CARBONO…" /></div>
            <div className="col-span-2"><span className={lbl}>Especificação técnica (norma)</span>
              <Autocomplete campo="norma" value={form.especificacao} onChange={(v) => setF("especificacao", v)} placeholder="ex.: ASTM A572" /></div>
            <div><span className={lbl}>Nº certificado</span><input value={form.certificado} onChange={(e) => setF("certificado", e.target.value)} className={inp} /></div>
            <div><span className={lbl}>Lote / corrida</span><input value={form.loteCorrida} onChange={(e) => setF("loteCorrida", e.target.value)} className={inp} /></div>
            <div><span className={lbl}>Pedido compra</span>
              <div className="flex gap-1">
                <input value={form.pedidoCompra} onChange={(e) => setF("pedidoCompra", e.target.value)} onKeyDown={(e) => e.key === "Enter" && puxarPedido()} placeholder="nº" className={inp} />
                <button type="button" onClick={puxarPedido} disabled={buscandoPed} title="Puxar os itens do pedido" className="px-3 rounded-lg bg-torg-blue text-white hover:bg-torg-dark disabled:opacity-50 shrink-0">{buscandoPed ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}</button>
              </div>
            </div>
            <div><span className={lbl}>Data receb.</span><input type="date" value={form.dataRecebimento} onChange={(e) => setF("dataRecebimento", e.target.value)} className={inp} /></div>
            <div><span className={lbl}>Nº NF</span><input value={form.nf} onChange={(e) => setF("nf", e.target.value)} inputMode="numeric" className={inp} /></div>
            <div><span className={lbl}>Fornecedor</span><input value={form.fornecedor} onChange={(e) => setF("fornecedor", e.target.value)} className={inp} /></div>
            <div><span className={lbl}>Obra (OP)</span><input value={form.obra} onChange={(e) => setF("obra", e.target.value)} placeholder="ex.: OP 067" className={inp} /></div>
            <div><span className={lbl}>Qtd peças</span><input value={form.qtd} onChange={(e) => setF("qtd", e.target.value)} inputMode="numeric" className={inp} /></div>
            <div><span className={lbl}>Peso / litro</span><input value={form.pesoLitro} onChange={(e) => setF("pesoLitro", e.target.value)} inputMode="decimal" className={inp} /></div>
            <div className="col-span-2 sm:col-span-4"><span className={lbl}>Observação</span><input value={form.observacao} onChange={(e) => setF("observacao", e.target.value)} className={inp} /></div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setModo(null)} className="px-4 py-2.5 text-sm text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
            <button onClick={salvarForm} disabled={salvando} className="px-5 py-2.5 bg-torg-blue text-white rounded-lg text-sm font-medium inline-flex items-center gap-2 hover:bg-torg-dark disabled:opacity-50">
              {salvando ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Lançar
            </button>
          </div>
        </div>
      )}

      {/* Colar em massa */}
      {modo === "massa" && (
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-4 space-y-3">
          <p className="text-[12px] text-torg-gray">Copie as linhas do Excel (na ordem da planilha) e cole abaixo. O <strong>índice R é automático</strong>. Confira na prévia e grave.</p>
          <textarea rows={4} onPaste={(e) => { e.preventDefault(); colar(e.clipboardData.getData("text")); }} onChange={(e) => colar(e.target.value)}
            placeholder="Cole aqui (Ctrl+V) as linhas copiadas do Excel…" className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2 font-mono focus:ring-2 focus:ring-torg-blue outline-none" />
          {massa.length > 0 && (
            <>
              <div className="overflow-x-auto border border-gray-100 rounded-lg max-h-72 overflow-y-auto">
                <table className="w-full text-xs whitespace-nowrap">
                  <thead className="bg-gray-50/60 sticky top-0"><tr className="text-[10px] text-gray-500 uppercase">
                    <th className="px-2 py-1.5 text-left">R/RC</th><th className="px-2 py-1.5 text-left">Descrição</th><th className="px-2 py-1.5 text-left">Espec.</th><th className="px-2 py-1.5 text-left">Certif.</th><th className="px-2 py-1.5 text-left">Corrida</th><th className="px-2 py-1.5 text-left">Pedido</th><th className="px-2 py-1.5 text-left">Data</th><th className="px-2 py-1.5 text-left">NF</th><th className="px-2 py-1.5 text-left">Forn.</th><th className="px-2 py-1.5 text-left">Obra</th><th className="px-2 py-1.5 text-right">Qtd</th><th className="px-2 py-1.5 text-right">Peso</th><th className="px-2 py-1.5"></th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {massa.map((m, i) => (
                      <tr key={i} className="hover:bg-gray-50/50">
                        <td className="px-2 py-1 font-mono">{m.rc}</td>
                        <td className="px-2 py-1 max-w-[260px] truncate" title={m.descricao}>{m.descricao}</td>
                        <td className="px-2 py-1">{m.especificacao}</td><td className="px-2 py-1">{m.certificado}</td><td className="px-2 py-1">{m.loteCorrida}</td><td className="px-2 py-1">{m.pedidoCompra}</td><td className="px-2 py-1">{m.dataRecebimento}</td><td className="px-2 py-1">{m.nf}</td><td className="px-2 py-1">{m.fornecedor}</td><td className="px-2 py-1">{m.obra}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{m.qtd}</td><td className="px-2 py-1 text-right tabular-nums">{m.pesoLitro}</td>
                        <td className="px-2 py-1 text-right"><button onClick={() => setMassa((a) => a.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-600"><Trash2 size={13} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-torg-gray">{massa.length} linha(s) prontas.</span>
                <div className="flex gap-2">
                  <button onClick={() => setMassa([])} className="px-4 py-2 text-sm text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-50">Limpar</button>
                  <button onClick={salvarMassa} disabled={salvando} className="px-5 py-2 bg-torg-blue text-white rounded-lg text-sm font-medium inline-flex items-center gap-2 hover:bg-torg-dark disabled:opacity-50">
                    {salvando ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Gravar {massa.length}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Lista do ano */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[12px] font-bold text-torg-dark">Lançados em {ano} <span className="font-normal text-torg-gray">· {dados?.total ?? "…"} itens</span></p>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar descrição, fornecedor, OP, NF…" className="w-64 pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <button onClick={exportarExcel} disabled={exportando || !visiveis.length} title="Baixar a planilha em Excel (.xlsx) com o que está na tela"
              className="text-sm font-medium rounded-lg px-3 py-2 inline-flex items-center gap-2 bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">
              {exportando ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />} <span className="hidden sm:inline">Exportar Excel</span>
            </button>
          </div>
        </div>
        {/* Legenda + filtros ativos */}
        <div className="px-4 py-1.5 flex items-center gap-4 text-[11px] text-torg-gray border-b border-gray-50 flex-wrap">
          <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-yellow-200 border border-yellow-300" /> com certificado</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-100 border border-red-300" /> falta certificado</span>
          {(Object.keys(filtros).length > 0 || ordenar) && (
            <button onClick={() => { setFiltros({}); setOrdenar(null); }} className="ml-auto text-torg-blue hover:underline inline-flex items-center gap-1"><X size={12} /> Limpar filtros ({visiveis.length} de {linhas.length})</button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="text-[12px] whitespace-nowrap" style={{ minWidth: 1500 }}>
            <thead className="bg-gray-100"><tr className="text-[10px] text-gray-600 uppercase">
              {COLUNAS.map((col) => {
                const ativo = !!filtros[col.key];
                const ord = ordenar?.key === col.key ? ordenar.dir : null;
                return (
                  <th key={col.key} className={`px-2.5 py-2 ${col.align === "right" ? "text-right" : "text-left"}`}>
                    <button onClick={(e) => setFiltroAberto({ key: col.key, rect: e.currentTarget.getBoundingClientRect() })}
                      className={`inline-flex items-center gap-1 hover:text-torg-blue ${ativo || ord ? "text-torg-blue" : ""}`}>
                      {col.label}
                      {ord === "asc" ? <ArrowUp size={11} /> : ord === "desc" ? <ArrowDown size={11} /> : null}
                      <Filter size={11} className={ativo ? "fill-torg-blue" : "opacity-40"} />
                    </button>
                  </th>
                );
              })}
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {dados === null ? <tr><td colSpan={14} className="px-3 py-8 text-center text-torg-gray"><Loader2 size={16} className="animate-spin inline" /></td></tr>
                : visiveis.length === 0 ? <tr><td colSpan={14} className="px-3 py-8 text-center text-torg-gray">{linhas.length === 0 ? `Nenhum lançamento em ${ano}.` : "Nenhuma linha com os filtros atuais."}</td></tr>
                : visiveis.map((l) => (
                  <tr key={l.id} className={l.certOk ? "bg-yellow-50 hover:bg-yellow-100/70" : "bg-red-50 hover:bg-red-100/60"}>
                    <td className="px-2.5 py-1.5 font-mono font-semibold">{l.rc}</td>
                    <td className="px-2.5 py-1.5 font-mono text-torg-blue">{l.importRef}</td>
                    <td className="px-2.5 py-1.5 min-w-[280px] max-w-[420px] whitespace-normal break-words" title={l.nome}>{l.nome}</td>
                    <td className="px-2.5 py-1.5">{l.certOk ? l.numeroDocumento : <span className="text-red-600 font-medium">falta</span>}</td>
                    <td className="px-2.5 py-1.5 text-torg-gray">{l.numeroCorrida || "—"}</td>
                    <td className="px-2.5 py-1.5">{l.norma || "—"}</td>
                    <td className="px-2.5 py-1.5">{l.pedidoCompra || "—"}</td>
                    <td className="px-2.5 py-1.5 text-torg-gray">{l.dataFmt}</td>
                    <td className="px-2.5 py-1.5">{l.nfNumero || "—"}</td>
                    <td className="px-2.5 py-1.5">{l.fornecedor || "—"}</td>
                    <td className="px-2.5 py-1.5 font-mono">{l.opNumero || "—"}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{fmtNum(l.quantidade)}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{fmtNum(l.pesoKg)}</td>
                    <td className="px-2.5 py-1.5 min-w-[200px] max-w-[360px] whitespace-normal break-words text-torg-gray" title={l.obs}>{l.obs || "—"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {filtroAberto && (
        <ColunaFiltro
          col={COLUNAS.find((c) => c.key === filtroAberto.key)}
          rect={filtroAberto.rect}
          valores={distintos(filtroAberto.key)}
          selecionados={filtros[filtroAberto.key]}
          ordenar={ordenar?.key === filtroAberto.key ? ordenar.dir : null}
          onOrdenar={(dir) => { setOrdenar(dir ? { key: filtroAberto.key, dir } : null); setFiltroAberto(null); }}
          onAplicar={(sel) => { setFiltros((f) => { const n = { ...f }; if (sel) n[filtroAberto.key] = sel; else delete n[filtroAberto.key]; return n; }); setFiltroAberto(null); }}
          onClose={() => setFiltroAberto(null)}
        />
      )}
    </div>
  );
}

// Popup de filtro de coluna (estilo Excel): ordenar, pesquisar, marcar/desmarcar valores.
function ColunaFiltro({ col, rect, valores, selecionados, ordenar, onOrdenar, onAplicar, onClose }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(() => new Set(selecionados || valores)); // undefined = todos
  const filtrados = valores.filter((v) => v.toLowerCase().includes(q.toLowerCase()));
  const todosMarcados = filtrados.every((v) => sel.has(v));
  const toggle = (v) => setSel((s) => { const n = new Set(s); n.has(v) ? n.delete(v) : n.add(v); return n; });
  const marcarTodos = () => setSel((s) => { const n = new Set(s); if (todosMarcados) filtrados.forEach((v) => n.delete(v)); else filtrados.forEach((v) => n.add(v)); return n; });
  function aplicar() {
    // se selecionou tudo → sem filtro (undefined); senão manda o set
    onAplicar(sel.size === valores.length ? null : new Set(sel));
  }
  const left = Math.max(8, Math.min(rect.left, (typeof window !== "undefined" ? window.innerWidth : 1200) - 300));
  const top = rect.bottom + 4;
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="fixed z-50 w-72 bg-white border border-gray-200 rounded-lg shadow-xl text-[12px]" style={{ left, top }}>
        <div className="p-2 border-b border-gray-100">
          <p className="text-[10px] font-semibold text-torg-gray uppercase px-1 pb-1">{col.label}</p>
          <button onClick={() => onOrdenar(ordenar === "asc" ? null : "asc")} className={`w-full text-left px-2 py-1.5 rounded hover:bg-gray-50 inline-flex items-center gap-2 ${ordenar === "asc" ? "text-torg-blue" : ""}`}><ArrowUp size={13} /> Ordenar A→Z (menor→maior)</button>
          <button onClick={() => onOrdenar(ordenar === "desc" ? null : "desc")} className={`w-full text-left px-2 py-1.5 rounded hover:bg-gray-50 inline-flex items-center gap-2 ${ordenar === "desc" ? "text-torg-blue" : ""}`}><ArrowDown size={13} /> Ordenar Z→A (maior→menor)</button>
        </div>
        <div className="p-2">
          <div className="relative mb-2">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="Pesquisar…" className="w-full pl-7 pr-2 py-1.5 border border-gray-300 rounded-lg text-xs" />
          </div>
          <label className="flex items-center gap-2 px-1 py-1 font-medium cursor-pointer">
            <input type="checkbox" checked={todosMarcados} onChange={marcarTodos} /> (Selecionar tudo)
          </label>
          <div className="max-h-56 overflow-y-auto border-t border-gray-100 mt-1 pt-1">
            {filtrados.length === 0 ? <p className="px-1 py-2 text-torg-gray">Nada encontrado.</p>
              : filtrados.map((v) => (
                <label key={v} className="flex items-center gap-2 px-1 py-0.5 cursor-pointer hover:bg-gray-50 rounded">
                  <input type="checkbox" checked={sel.has(v)} onChange={() => toggle(v)} />
                  <span className="truncate" title={v}>{v}</span>
                </label>
              ))}
          </div>
        </div>
        <div className="p-2 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
          <button onClick={aplicar} className="px-3 py-1.5 bg-torg-blue text-white rounded-lg hover:bg-torg-dark">OK</button>
        </div>
      </div>
    </>
  );
}

// Input com autocomplete (/api/compras/cmr/sugestoes).
function Autocomplete({ campo, value, onChange, placeholder }) {
  const [lista, setLista] = useState([]);
  const [aberto, setAberto] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!aberto || (value || "").trim().length < 2) { setLista([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/compras/cmr/sugestoes?campo=${campo}&q=${encodeURIComponent(value.trim())}`).then((r) => r.json()).then((j) => setLista(j.sugestoes || [])).catch(() => setLista([]));
    }, 250);
    return () => clearTimeout(t);
  }, [value, aberto, campo]);
  return (
    <div className="relative" ref={box}>
      <input value={value} onChange={(e) => { onChange(e.target.value); setAberto(true); }} onFocus={() => setAberto(true)} onBlur={() => setTimeout(() => setAberto(false), 150)} placeholder={placeholder} className={inp} />
      {aberto && lista.length > 0 && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {lista.map((v, i) => (
            <button key={i} type="button" onMouseDown={(e) => { e.preventDefault(); onChange(v); setAberto(false); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-torg-blue-50 border-b border-gray-50 last:border-0">{v}</button>
          ))}
        </div>
      )}
    </div>
  );
}
