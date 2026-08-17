"use client";
// Painel de despacho de peças (fluxo do PCP) aberto ao clicar num card da OP na TV.
// Lista as peças EM ABERTO da OP e destina (uma ou várias): Prioridade / Terceiro / Revisão /
// Aguardando material / Cancelar. Reusa /api/pcp/despacho (GET peças + placar, POST despacha).
import { useState, useEffect, useCallback } from "react";
import { X, Loader2, Star, Truck, RotateCcw, Ban, Package } from "lucide-react";

const DESTINOS = [
  { key: "PRIORIDADE", label: "Prioridade", icon: Star, cor: "bg-amber-500 hover:bg-amber-600", desc: "libera p/ desenho e corte" },
  { key: "TERCEIRO", label: "Terceiro", icon: Truck, cor: "bg-indigo-600 hover:bg-indigo-700", desc: "terceiriza (vai p/ /pcp/terceirizados)" },
  { key: "REVISAO", label: "Revisão", icon: RotateCcw, cor: "bg-sky-600 hover:bg-sky-700", desc: "volta p/ engenharia revisar" },
  { key: "AGUARDANDO_MATERIAL", label: "Aguard. material", icon: Package, cor: "bg-slate-500 hover:bg-slate-600", desc: "trava esperando matéria-prima" },
  { key: "CANCELADA", label: "Cancelar", icon: Ban, cor: "bg-red-600 hover:bg-red-700", desc: "tira do escopo" },
];
const VOLTA = ["MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDICAO"];
const ROTULO = { ABERTO: "Em aberto", PRIORIDADE: "Prioridade", TERCEIRO: "Terceiro", REVISAO: "Revisão", AGUARDANDO_MATERIAL: "Aguard. material", CANCELADA: "Cancelada" };
// Só rotula o tipo quando a LPC marcou (CONJUNTO/CROQUI); null (ex.: guarda-corpo não tipado) NÃO vira "croqui".
const tipoLabel = (t) => (t === "CONJUNTO" ? "conjunto" : t === "CROQUI" ? "croqui" : null);

export default function DespachoPanel({ obra, setor, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [sel, setSel] = useState(() => new Set());
  const [enviando, setEnviando] = useState(false);
  const [terceiroVolta, setTerceiroVolta] = useState("MONTAGEM");

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

  const abertas = (data?.pecas || []).filter((p) => !p.destino && p.status === "PENDENTE");
  const toggle = (id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const todas = () => setSel((s) => (s.size === abertas.length ? new Set() : new Set(abertas.map((p) => p.id))));

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-white text-torg-dark rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold">{obra} · despacho de peças</h2>
            {data && <p className="text-[12px] text-torg-gray">{data.placar.ABERTO} em aberto · {data.total} peça(s){setor === "CORTE" ? " no corte (sub-peças P + conjuntos solo)" : " no total"}</p>}
          </div>
          <button onClick={onClose} className="text-torg-gray hover:text-red-600"><X size={20} /></button>
        </div>

        {data && (
          <div className="flex flex-wrap gap-1.5 px-5 py-2 border-b border-gray-50 text-[11px]">
            {Object.entries(data.placar).filter(([, v]) => v > 0).map(([k, v]) => (
              <span key={k} className="bg-gray-100 rounded-full px-2 py-0.5 font-medium text-torg-dark">{ROTULO[k] || k}: {v}</span>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading && <div className="py-10 text-center text-torg-gray"><Loader2 className="mx-auto animate-spin" /></div>}
          {erro && <p className="text-red-600 text-sm">{erro}</p>}
          {!loading && !erro && abertas.length === 0 && <p className="text-torg-gray text-sm text-center py-8">Nenhuma peça em aberto — tudo despachado. 🎉</p>}
          {!loading && abertas.length > 0 && (
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
        </div>

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
      </div>
    </div>
  );
}
