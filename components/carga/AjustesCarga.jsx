"use client";
// Ajustes por marca do simulador: editor de uma marca (embalagem, junto com, posição, orientação, medidas) e a
// lista das regras da obra. Gravado por OP — vale para os próximos romaneios. Depois de ajustar, "Simular de novo".
import { useState } from "react";
import { SlidersHorizontal, X, Save, Trash2, Loader2 } from "lucide-react";
import { EMBALAGEM, POSICAO, ORIENTACAO, resumoDaRegra } from "@/lib/carga/ajustes";

const sel = "w-full text-[12px] border border-gray-300 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-torg-blue/30";

/** Editor de uma marca. `onSalvar(marca, regras|null)` devolve a promessa da gravação. */
export function EditorAjuste({ marca, desc, regras, semGeometria, onSalvar, onFechar }) {
  const [r, setR] = useState({ embalagem: regras?.embalagem || "", juntoCom: regras?.juntoCom || "", posicao: regras?.posicao || "", orientacao: regras?.orientacao || "", medidas: regras?.medidas || { C: "", L: "", A: "" }, observacao: regras?.observacao || "" });
  const [salvando, setSalvando] = useState(false), [erro, setErro] = useState("");
  const m = (k, v) => setR((x) => ({ ...x, [k]: v })), med = (k, v) => setR((x) => ({ ...x, medidas: { ...x.medidas, [k]: v } }));
  const salvar = async (limpar) => {
    setSalvando(true); setErro("");
    try { await onSalvar(marca, limpar ? null : { ...r, medidas: r.medidas.C || r.medidas.L || r.medidas.A ? r.medidas : null }); onFechar(); }
    catch (e) { setErro(e.message || "Não salvou"); } finally { setSalvando(false); }
  };
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <SlidersHorizontal size={16} className="text-torg-blue" />
          <div className="min-w-0"><h3 className="text-sm font-bold text-torg-dark">Ajustar {marca}</h3><p className="text-[11px] text-torg-gray truncate">{desc || ""}</p></div>
          <button onClick={onFechar} className="ml-auto text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-3 text-[12px]">
          <label className="block"><span className="font-medium text-torg-dark">Embalagem</span><select value={r.embalagem} onChange={(e) => m("embalagem", e.target.value)} className={`${sel} mt-1`}>{EMBALAGEM.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className="block"><span className="font-medium text-torg-dark">Junto com</span><input value={r.juntoCom} onChange={(e) => m("juntoCom", e.target.value)} placeholder='nome do grupo, ex.: "kit escada 1"' className={`${sel} mt-1`} /><span className="text-[11px] text-torg-gray">Marcas com o mesmo nome de grupo viajam num pacote só.</span></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="font-medium text-torg-dark">Posição na pilha</span><select value={r.posicao} onChange={(e) => m("posicao", e.target.value)} className={`${sel} mt-1`}>{POSICAO.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label className="block"><span className="font-medium text-torg-dark">Orientação</span><select value={r.orientacao} onChange={(e) => m("orientacao", e.target.value)} className={`${sel} mt-1`}>{ORIENTACAO.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          </div>
          <div>
            <span className="font-medium text-torg-dark">Medidas à mão (mm){semGeometria ? " — a marca não está no IFC" : ""}</span>
            <div className="grid grid-cols-3 gap-2 mt-1">{[["C", "Comprimento"], ["L", "Largura"], ["A", "Altura"]].map(([k, l]) => <input key={k} type="number" min="1" value={r.medidas[k] ?? ""} onChange={(e) => med(k, e.target.value)} placeholder={l} className={`${sel} text-right`} />)}</div>
            <span className="text-[11px] text-torg-gray">Preenchidas, valem acima do IFC e da estimativa pelo peso.</span>
          </div>
          <label className="block"><span className="font-medium text-torg-dark">Observação</span><input value={r.observacao} onChange={(e) => m("observacao", e.target.value)} className={`${sel} mt-1`} maxLength={200} /></label>
          {erro && <p className="text-red-700">{erro}</p>}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-2">
          {regras && <button onClick={() => salvar(true)} disabled={salvando} className="text-[12px] text-red-700 inline-flex items-center gap-1 hover:underline"><Trash2 size={13} /> Remover ajuste</button>}
          <span className="ml-auto flex gap-2">
            <button onClick={onFechar} className="text-[12px] text-torg-gray border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50">Cancelar</button>
            <button onClick={() => salvar(false)} disabled={salvando} className="text-[12px] font-semibold text-white bg-torg-blue rounded-lg px-4 py-1.5 hover:bg-torg-dark inline-flex items-center gap-1.5 disabled:opacity-50">{salvando ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Salvar</button>
          </span>
        </div>
      </div>
    </div>
  );
}

/** Lista das regras da obra (chips), com busca de marca para ajustar qualquer uma da lista. */
export function ListaAjustes({ ajustes, lista, onEditar, desatualizada }) {
  const [busca, setBusca] = useState("");
  const marcas = Object.keys(ajustes || {}).sort((a, b) => a.localeCompare(b, "pt", { numeric: true }));
  const q = busca.trim().toUpperCase(), sugestoes = q ? (lista || []).filter((i) => i.marca.includes(q)).slice(0, 8) : [];
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-3 py-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[12px] font-bold text-torg-dark inline-flex items-center gap-1.5"><SlidersHorizontal size={14} className="text-torg-blue" /> Ajustes por marca <span className="font-normal text-torg-gray">· {marcas.length} nesta obra</span></span>
        {desatualizada && <span className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">ajustes mudaram — simule de novo</span>}
        <span className="ml-auto relative">
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Ajustar outra marca…" className="text-[12px] border border-gray-200 rounded-lg px-2 py-1 w-44" />
          {sugestoes.length > 0 && <div className="absolute right-0 z-10 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg">{sugestoes.map((i) => <button key={i.marca} onClick={() => { onEditar(i.marca, i.desc); setBusca(""); }} className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-torg-blue-50"><b>{i.marca}</b> <span className="text-torg-gray">{i.desc}</span></button>)}</div>}
        </span>
      </div>
      {marcas.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {marcas.map((m) => <button key={m} onClick={() => onEditar(m, (lista || []).find((i) => i.marca === m)?.desc)} className="text-[11px] border border-torg-blue-200 bg-torg-blue-50 text-torg-dark rounded-full px-2 py-0.5 hover:border-torg-blue"><b>{m}</b> · {resumoDaRegra(ajustes[m])}</button>)}
        </div>
      )}
    </div>
  );
}
