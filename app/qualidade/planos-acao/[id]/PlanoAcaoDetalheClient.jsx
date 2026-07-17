"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ListChecks, Loader2, FileDown, Trash2, Plus, CheckCircle2, AlertCircle } from "lucide-react";
import { numPA, STATUS_PLANO, STATUS_PLANO_OPCOES, STATUS_ITEM, STATUS_ITEM_OPCOES, SITUACAO_ITEM, situacaoItem, situacaoItemLabel } from "@/lib/plano-acao";

const dISO = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");
const novoItem = () => ({ oque: "", porque: "", onde: "", quem: "", quando: "", como: "", quanto: "", status: "A_FAZER", acompanhamento: "" });

export default function PlanoAcaoDetalheClient({ id }) {
  const router = useRouter();
  const [p, setP] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");

  const [cab, setCab] = useState({ titulo: "", origem: "", responsavel: "", status: "EM_ANDAMENTO" });
  const [itens, setItens] = useState([]);

  const carregar = useCallback(() => {
    setLoading(true);
    fetch(`/api/qualidade/planos-acao/${id}`).then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (!j?.plano) return setErro("Plano não encontrado");
      const x = j.plano;
      setP(x);
      setCab({ titulo: x.titulo || "", origem: x.origem || "", responsavel: x.responsavel || "", status: x.status || "EM_ANDAMENTO" });
      setItens((Array.isArray(x.itens) ? x.itens : []).map((i) => ({ ...novoItem(), ...i, quando: dISO(i.quando) })));
    }).catch(() => setErro("Erro ao carregar")).finally(() => setLoading(false));
  }, [id]);
  useEffect(() => { carregar(); }, [carregar]);

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(""), 2800); };
  const setC = (k, v) => setCab((s) => ({ ...s, [k]: v }));
  const setIt = (i, k, v) => setItens((p) => p.map((it, j) => (j === i ? { ...it, [k]: v } : it)));

  async function salvar() {
    if (!cab.titulo.trim()) return setErro("Informe o título do plano.");
    setErro(""); setSalvando(true);
    try {
      const r = await fetch(`/api/qualidade/planos-acao/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...cab, itens: itens.filter((i) => (i.oque || "").trim()) }) });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro ao salvar");
      flash("Plano salvo.");
      carregar();
    } catch (e) { setErro(e.message); } finally { setSalvando(false); }
  }

  async function excluir() {
    if (!confirm("Excluir este plano de ação? Esta ação não pode ser desfeita.")) return;
    setSalvando(true);
    try {
      const r = await fetch(`/api/qualidade/planos-acao/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Erro ao excluir");
      router.push("/qualidade/planos-acao");
    } catch (e) { alert(e.message); setSalvando(false); }
  }

  if (loading) return <div className="py-20 text-center text-torg-gray"><Loader2 size={26} className="mx-auto animate-spin mb-2" /> Carregando…</div>;
  if (erro && !p) return <div className="py-20 text-center text-red-600 text-sm">{erro} · <Link href="/qualidade/auditorias-internas?aba=planos" className="text-torg-blue underline">voltar</Link></div>;

  const concl = itens.filter((i) => i.status === "CONCLUIDO").length;

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link href="/qualidade/auditorias-internas?aba=planos" className="text-sm text-torg-gray hover:text-torg-blue inline-flex items-center gap-1"><ArrowLeft size={15} /> Planos de ação</Link>
        <div className="flex items-center gap-2">
          <a href={`/api/qualidade/planos-acao/${id}/pdf`} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-torg-dark inline-flex items-center gap-1.5"><FileDown size={14} /> PDF</a>
          <button onClick={excluir} disabled={salvando} className="px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-red-50 hover:border-red-200 hover:text-red-600 text-torg-gray"><Trash2 size={14} /></button>
        </div>
      </div>

      {msg && <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-lg px-4 py-2.5 flex items-center gap-2"><CheckCircle2 size={15} /> {msg}</div>}

      {/* Cabeçalho do plano */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-torg-blue text-lg">{numPA(p.numero)}</span>
          <ListChecks size={18} className="text-torg-blue" />
          <span className="text-sm text-torg-gray">Plano de Ação 5W2H · {concl}/{itens.length} ações concluídas</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-torg-dark mb-1">Título</label>
            <input value={cab.titulo} onChange={(e) => setC("titulo", e.target.value)} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Origem</label>
            <input value={cab.origem} onChange={(e) => setC("origem", e.target.value)} placeholder="RAI-001, NC…" className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Situação do plano</label>
            <select value={cab.status} onChange={(e) => setC("status", e.target.value)} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white">
              {STATUS_PLANO_OPCOES.map((s) => <option key={s} value={s}>{STATUS_PLANO[s].label}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-torg-dark mb-1">Responsável pelo plano</label>
            <input value={cab.responsavel} onChange={(e) => setC("responsavel", e.target.value)} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
          </div>
        </div>
      </div>

      {/* Ações 5W2H */}
      <div className="space-y-3">
        {itens.map((it, i) => {
          const sit = situacaoItem({ ...it, quando: it.quando || null });
          const sc = SITUACAO_ITEM[sit];
          return (
            <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50/70 border-b border-gray-100 flex-wrap">
                <span className="text-[12px] font-bold text-torg-dark">Ação {i + 1}</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: sc.bg, color: sc.cor }}>{situacaoItemLabel(sit)}</span>
                <div className="ml-auto flex items-center gap-1.5">
                  {STATUS_ITEM_OPCOES.map((st) => {
                    const sel = it.status === st; const info = STATUS_ITEM[st];
                    return <button key={st} type="button" onClick={() => setIt(i, "status", st)} className="px-2 py-1 rounded-full text-[10px] font-semibold border transition-colors" style={sel ? { background: info.cor, color: "#fff", borderColor: info.cor } : { background: "#fff", color: "#576D7E", borderColor: "#e5e7eb" }}>{info.label}</button>;
                  })}
                  <button onClick={() => setItens((p) => p.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-500 p-1 ml-1"><Trash2 size={14} /></button>
                </div>
              </div>
              <div className="p-4 space-y-3">
                <Campo w="What" label="O quê"><textarea value={it.oque} onChange={(e) => setIt(i, "oque", e.target.value)} rows={1} placeholder="A ação a executar" className="inp" /></Campo>
                <Campo w="Why" label="Por quê"><textarea value={it.porque} onChange={(e) => setIt(i, "porque", e.target.value)} rows={1} placeholder="Justificativa" className="inp" /></Campo>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Campo w="Where" label="Onde"><input value={it.onde} onChange={(e) => setIt(i, "onde", e.target.value)} placeholder="Local / setor" className="inp" /></Campo>
                  <Campo w="Who" label="Quem"><input value={it.quem} onChange={(e) => setIt(i, "quem", e.target.value)} placeholder="Responsável" className="inp" /></Campo>
                  <Campo w="When" label="Quando"><input type="date" value={it.quando} onChange={(e) => setIt(i, "quando", e.target.value)} className="inp" /></Campo>
                  <Campo w="How much" label="Quanto"><input value={it.quanto} onChange={(e) => setIt(i, "quanto", e.target.value)} placeholder="Custo (R$)" className="inp" /></Campo>
                </div>
                <Campo w="How" label="Como"><textarea value={it.como} onChange={(e) => setIt(i, "como", e.target.value)} rows={1} placeholder="Método / como será feito" className="inp" /></Campo>
                <div>
                  <label className="block text-[11px] font-medium text-torg-gray mb-1">Acompanhamento</label>
                  <textarea value={it.acompanhamento} onChange={(e) => setIt(i, "acompanhamento", e.target.value)} rows={2} placeholder="Andamento, evidência, o que foi feito…" className="inp" />
                </div>
              </div>
            </div>
          );
        })}
        <button onClick={() => setItens((p) => [...p, novoItem()])} className="w-full py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-sm text-torg-blue hover:border-torg-blue-200 hover:bg-torg-blue-50/30 font-medium inline-flex items-center justify-center gap-1.5"><Plus size={15} /> Adicionar ação</button>
      </div>

      {erro && <p className="text-[12px] text-red-600 flex items-center gap-1"><AlertCircle size={13} /> {erro}</p>}

      <div className="sticky bottom-0 bg-white/95 backdrop-blur border-t border-gray-100 -mx-8 px-8 py-3 flex justify-end">
        <button onClick={salvar} disabled={salvando} className="px-5 py-2 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-dark font-medium inline-flex items-center gap-1.5 disabled:opacity-50">{salvando ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Salvar plano</button>
      </div>

      <style jsx>{`.inp{width:100%;font-size:13px;border:1px solid #d1d5db;border-radius:8px;padding:7px 11px;resize:vertical}`}</style>
    </div>
  );
}

function Campo({ w, label, children }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-torg-gray mb-1">{label} <span className="text-gray-300 font-normal">· {w}</span></label>
      {children}
    </div>
  );
}
