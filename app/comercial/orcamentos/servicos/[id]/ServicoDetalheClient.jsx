"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, AlertCircle, RefreshCw, Save, Wrench, LayoutGrid } from "lucide-react";
import { useStore } from "@/lib/store";
import { SERVICOS, STATUS_SERVICO } from "@/lib/orcamento-servico";

const os = (n) => (n ? `OS-${String(n).padStart(3, "0")}` : "—");

export default function ServicoDetalheClient({ id }) {
  const { showToast } = useStore();
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [numero, setNumero] = useState(null);
  const [cliente, setCliente] = useState("");
  const [obra, setObra] = useState("");
  const [contato, setContato] = useState("");
  const [servSel, setServSel] = useState([]);
  const [status, setStatus] = useState("RASCUNHO");
  const [obs, setObs] = useState("");
  const [dirty, setDirty] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const marcar = () => setDirty(true);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await fetch(`/api/comercial/orcamento-servico/${id}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao carregar");
      const o = d.orcamento;
      setNumero(o.numero || null); setCliente(o.cliente || ""); setObra(o.obra || ""); setContato(o.contato || "");
      setServSel(Array.isArray(o.servicos) ? o.servicos : []); setStatus(o.status || "RASCUNHO"); setObs(o.observacoes || "");
      setDirty(false);
    } catch (e) { setErro(e.message); } finally { setCarregando(false); }
  }, [id]);
  useEffect(() => { carregar(); }, [carregar]);

  const toggleServ = (k) => { setServSel((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k])); marcar(); };

  const salvar = async () => {
    if (cliente.trim().length < 2) { showToast("Informe o cliente", "error"); return; }
    if (!servSel.length) { showToast("Selecione ao menos um serviço", "error"); return; }
    setSalvando(true);
    try {
      const r = await fetch(`/api/comercial/orcamento-servico/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cliente, obra: obra || null, contato: contato || null, servicos: servSel, status, observacoes: obs || null }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao salvar");
      setDirty(false); showToast("Salvo", "success");
    } catch (e) { showToast(e.message, "error"); } finally { setSalvando(false); }
  };

  if (carregando) return <div className="py-20 text-center text-torg-gray"><Loader2 size={30} className="mx-auto animate-spin mb-2" /> Carregando...</div>;
  if (erro) return (
    <div className="py-20 text-center">
      <AlertCircle size={30} className="mx-auto text-red-400 mb-2" /><p className="text-sm text-red-600 mb-3">{erro}</p>
      <button onClick={carregar} className="px-3 py-1.5 text-sm bg-torg-blue text-white rounded-lg inline-flex items-center gap-2"><RefreshCw size={14} /> Tentar novamente</button>
    </div>
  );

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href="/comercial/orcamentos/servicos" className="text-sm text-torg-gray hover:text-torg-dark inline-flex items-center gap-1.5"><ArrowLeft size={16} /> Orçamentos de serviço</Link>
          {numero && <span className="text-xs font-mono font-semibold text-torg-blue bg-torg-blue-50 rounded-full px-2 py-0.5">{os(numero)}</span>}
        </div>
        <div className="flex items-center gap-2">
          {dirty && <span className="text-xs text-amber-600">não salvo</span>}
          <select value={status} onChange={(e) => { setStatus(e.target.value); marcar(); }} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-torg-blue">
            {Object.entries(STATUS_SERVICO).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <button onClick={salvar} disabled={salvando} className="px-4 py-2 bg-torg-orange text-white text-sm rounded-lg hover:bg-torg-orange/90 font-medium inline-flex items-center gap-2 disabled:opacity-50">
            {salvando ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Salvar
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-3">
        <h3 className="text-lg font-semibold text-torg-dark flex items-center gap-2"><Wrench size={18} className="text-torg-blue" /> Dados do orçamento</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div><label className="text-xs text-torg-gray">Cliente</label><input value={cliente} onChange={(e) => { setCliente(e.target.value); marcar(); }} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-torg-blue" /></div>
          <div><label className="text-xs text-torg-gray">Obra</label><input value={obra} onChange={(e) => { setObra(e.target.value); marcar(); }} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-torg-blue" /></div>
          <div><label className="text-xs text-torg-gray">Contato</label><input value={contato} onChange={(e) => { setContato(e.target.value); marcar(); }} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-torg-blue" /></div>
        </div>
        <div>
          <label className="text-xs text-torg-gray">Serviços</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
            {SERVICOS.map((s) => {
              const sel = servSel.includes(s.key);
              return (
                <button key={s.key} type="button" onClick={() => toggleServ(s.key)} className={`text-left text-sm rounded-lg border px-3 py-2 ${sel ? "border-torg-blue bg-torg-blue-50 text-torg-blue font-medium" : "border-gray-200 text-torg-dark hover:border-torg-blue-200"}`}>
                  <span className="inline-flex items-center gap-2"><span className={`w-4 h-4 rounded border flex items-center justify-center ${sel ? "bg-torg-blue border-torg-blue" : "border-gray-300"}`}>{sel && <span className="text-white text-[10px]">✓</span>}</span>{s.label}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <label className="text-xs text-torg-gray">Observações</label>
          <textarea value={obs} onChange={(e) => { setObs(e.target.value); marcar(); }} rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-torg-blue resize-y" />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-dashed border-gray-200 p-6 text-center">
        <LayoutGrid size={28} className="mx-auto text-gray-300 mb-2" />
        <p className="text-torg-dark font-medium">Abas da proposta — próxima etapa</p>
        <p className="text-sm text-torg-gray mt-1">Aqui vamos montar as abas de cada serviço selecionado (corte/furação, jateamento, pintura, solda) com os itens e valores para gerar a proposta.</p>
      </div>
    </div>
  );
}
