"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useStore } from "@/lib/store";
import { Loader2, Plus, ClipboardPaste, Save, Trash2, Search, Check, X, PackagePlus } from "lucide-react";

const anoAtual = new Date().getFullYear();
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const fmtNum = (v) => (v == null || v === "" ? "—" : Number(v).toLocaleString("pt-BR"));
const inp = "w-full text-sm border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-torg-blue outline-none";
const lbl = "block text-[11px] font-medium text-torg-gray uppercase tracking-wide mb-1";

const VAZIO = { rc: "R", descricao: "", especificacao: "", certificado: "", loteCorrida: "", pedidoCompra: "", dataRecebimento: "", nf: "", fornecedor: "", obra: "", qtd: "", pesoLitro: "", observacao: "" };
// Ordem das colunas ao COLAR do Excel (igual à planilha CMR; o índice R é automático).
const COLS_MASSA = ["rc", "_indice", "descricao", "certificado", "loteCorrida", "especificacao", "pedidoCompra", "dataRecebimento", "nf", "fornecedor", "obra", "qtd", "pesoLitro", "observacao"];

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

  const carregar = useCallback(async () => {
    const p = new URLSearchParams({ ano: String(ano) });
    if (busca.trim()) p.set("q", busca.trim());
    const r = await fetch(`/api/compras/cmr?${p}`).then((x) => x.json()).catch(() => null);
    if (r?.success) { setDados(r); if (r.anos?.length) setAnos(r.anos); }
  }, [ano, busca]);
  useEffect(() => { const t = setTimeout(carregar, 250); return () => clearTimeout(t); }, [carregar]);

  const setF = (k, v) => setForm((s) => ({ ...s, [k]: v }));

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
            <div><span className={lbl}>Pedido compra</span><input value={form.pedidoCompra} onChange={(e) => setF("pedidoCompra", e.target.value)} className={inp} /></div>
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
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar descrição, fornecedor, OP, NF…" className="w-64 pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] whitespace-nowrap">
            <thead className="bg-gray-50/60"><tr className="text-[10px] text-gray-500 uppercase">
              <th className="px-3 py-2 text-left">R</th><th className="px-3 py-2 text-left">Descrição</th><th className="px-3 py-2 text-left">Corrida</th><th className="px-3 py-2 text-left">Forn.</th><th className="px-3 py-2 text-left">Obra</th><th className="px-3 py-2 text-left">Data</th><th className="px-3 py-2 text-left">NF</th><th className="px-3 py-2 text-right">Qtd</th><th className="px-3 py-2 text-right">Peso</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {dados === null ? <tr><td colSpan={9} className="px-3 py-8 text-center text-torg-gray"><Loader2 size={16} className="animate-spin inline" /></td></tr>
                : itens.length === 0 ? <tr><td colSpan={9} className="px-3 py-8 text-center text-torg-gray">Nenhum lançamento em {ano}.</td></tr>
                : itens.map((it) => (
                  <tr key={it.id} className="hover:bg-gray-50/50">
                    <td className="px-3 py-1.5 font-mono text-torg-blue">{it.importRef}</td>
                    <td className="px-3 py-1.5 max-w-[300px] truncate" title={it.nome}>{it.nome}</td>
                    <td className="px-3 py-1.5 text-torg-gray">{it.numeroCorrida || "—"}</td>
                    <td className="px-3 py-1.5">{it.fornecedor || "—"}</td>
                    <td className="px-3 py-1.5 font-mono">{it.opNumero || "—"}</td>
                    <td className="px-3 py-1.5 text-torg-gray">{fmtData(it.dataRecebimento)}</td>
                    <td className="px-3 py-1.5">{it.nfNumero || "—"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(it.quantidade)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(it.pesoKg)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
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
