"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Wrench, Plus, Loader2, AlertCircle, RefreshCw, X, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { SERVICOS, SERVICO_LABEL, STATUS_SERVICO } from "@/lib/orcamento-servico";
import OrcamentosTabs from "@/components/OrcamentosTabs";

const fmt = (d) => new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
const ST = { RASCUNHO: "bg-amber-100 text-amber-700", ENVIADO: "bg-blue-100 text-blue-700", FECHADO: "bg-green-100 text-green-700", PERDIDO: "bg-red-100 text-red-700" };
const os = (n) => (n ? `OS-${String(n).padStart(3, "0")}` : "—");

export default function ServicosClient() {
  const { showToast } = useStore();
  const router = useRouter();
  const [lista, setLista] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const [novo, setNovo] = useState(false);
  const [cliente, setCliente] = useState("");
  const [obra, setObra] = useState("");
  const [contato, setContato] = useState("");
  const [servSel, setServSel] = useState([]);
  const [obs, setObs] = useState("");
  const [criando, setCriando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await fetch("/api/comercial/orcamento-servico");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao carregar");
      setLista(d.orcamentos || []);
    } catch (e) { setErro(e.message); } finally { setCarregando(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const abrirNovo = () => { setNovo(true); setCliente(""); setObra(""); setContato(""); setServSel([]); setObs(""); };
  const toggleServ = (k) => setServSel((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));

  const criar = async () => {
    if (cliente.trim().length < 2) { showToast("Informe o cliente", "error"); return; }
    if (!servSel.length) { showToast("Selecione ao menos um serviço", "error"); return; }
    setCriando(true);
    try {
      const r = await fetch("/api/comercial/orcamento-servico", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cliente, obra: obra || null, contato: contato || null, servicos: servSel, observacoes: obs || null }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao criar");
      router.push(`/comercial/orcamentos/servicos/${d.id}`);
    } catch (e) { showToast(e.message, "error"); setCriando(false); }
  };

  const excluir = async (id) => {
    if (!confirm("Excluir este orçamento de serviço?")) return;
    try {
      const r = await fetch(`/api/comercial/orcamento-servico/${id}`, { method: "DELETE" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha");
      setLista((p) => p.filter((x) => x.id !== id));
      showToast("Excluído", "success");
    } catch (e) { showToast(e.message, "error"); }
  };

  return (
    <div className="space-y-6 max-w-7xl">
      <OrcamentosTabs />
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2">
            <Wrench className="text-torg-blue" /> Propostas Serviço
          </h2>
          <p className="text-sm text-torg-gray mt-1">Corte e furação de vigas, jateamento, pintura e solda — numeração automática.</p>
        </div>
        <button onClick={abrirNovo} className="px-4 py-2.5 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 font-medium flex items-center gap-2">
          <Plus size={18} /> Nova proposta de serviço
        </button>
      </div>

      {carregando ? (
        <div className="py-16 text-center text-torg-gray"><Loader2 size={28} className="mx-auto animate-spin mb-2" /> Carregando...</div>
      ) : erro ? (
        <div className="py-16 text-center">
          <AlertCircle size={28} className="mx-auto text-red-400 mb-2" />
          <p className="text-sm text-red-600 mb-3">{erro}</p>
          <button onClick={carregar} className="px-3 py-1.5 text-sm bg-torg-blue text-white rounded-lg inline-flex items-center gap-2"><RefreshCw size={14} /> Tentar novamente</button>
        </div>
      ) : lista.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-xl border border-gray-100">
          <Wrench size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-torg-gray">Nenhum orçamento de serviço ainda.</p>
          <p className="text-sm text-torg-gray mt-1">Clique em “Novo orçamento de serviço” para começar.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/60">
                <tr className="text-left text-xs font-medium text-gray-500 uppercase">
                  <th className="px-4 py-3">Nº</th>
                  <th className="px-4 py-3">Cliente / Obra</th>
                  <th className="px-4 py-3">Serviços</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3">Criado</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {lista.map((o) => (
                  <tr key={o.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-mono text-torg-blue font-semibold whitespace-nowrap">{os(o.numero)}</td>
                    <td className="px-4 py-3">
                      <Link href={`/comercial/orcamentos/servicos/${o.id}`} className="font-medium text-torg-dark hover:text-torg-blue">{o.cliente}</Link>
                      <div className="text-[11px] text-torg-gray">{o.obra || "—"}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(Array.isArray(o.servicos) ? o.servicos : []).map((s) => (
                          <span key={s} className="text-[10px] bg-torg-blue-50 text-torg-blue rounded-full px-2 py-0.5">{SERVICO_LABEL[s] || s}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center"><span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${ST[o.status] || "bg-gray-100 text-gray-600"}`}>{STATUS_SERVICO[o.status] || o.status}</span></td>
                    <td className="px-4 py-3 text-torg-gray whitespace-nowrap text-xs">{fmt(o.createdAt)}{o.criadoPorNome ? ` · ${o.criadoPorNome}` : ""}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-3">
                        <Link href={`/comercial/orcamentos/servicos/${o.id}`} className="text-xs text-torg-blue hover:underline">Abrir</Link>
                        <button onClick={() => excluir(o.id)} className="text-red-400 hover:text-red-600" title="Excluir"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {novo && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !criando && setNovo(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-torg-dark">Novo orçamento de serviço</h3>
              <button onClick={() => setNovo(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>

            <label className="text-xs text-torg-gray">Cliente</label>
            <input value={cliente} onChange={(e) => setCliente(e.target.value)} autoFocus placeholder="Nome do cliente"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 mb-3 focus:ring-2 focus:ring-torg-blue" />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs text-torg-gray">Obra / Empreendimento</label>
                <input value={obra} onChange={(e) => setObra(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-torg-blue" />
              </div>
              <div>
                <label className="text-xs text-torg-gray">Contato</label>
                <input value={contato} onChange={(e) => setContato(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-torg-blue" />
              </div>
            </div>

            <label className="text-xs text-torg-gray">Serviços</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1 mb-3">
              {SERVICOS.map((s) => {
                const sel = servSel.includes(s.key);
                return (
                  <button key={s.key} type="button" onClick={() => toggleServ(s.key)}
                    className={`text-left text-sm rounded-lg border px-3 py-2 transition-colors ${sel ? "border-torg-blue bg-torg-blue-50 text-torg-blue font-medium" : "border-gray-200 text-torg-dark hover:border-torg-blue-200"}`}>
                    <span className="inline-flex items-center gap-2">
                      <span className={`w-4 h-4 rounded border flex items-center justify-center ${sel ? "bg-torg-blue border-torg-blue" : "border-gray-300"}`}>{sel && <span className="text-white text-[10px]">✓</span>}</span>
                      {s.label}
                    </span>
                  </button>
                );
              })}
            </div>

            <label className="text-xs text-torg-gray">Observações</label>
            <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={3} placeholder="Escopo, referências, prazos…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-torg-blue resize-y" />

            <div className="flex items-center justify-end gap-2 mt-5">
              <button onClick={() => setNovo(false)} className="px-4 py-2 text-sm text-torg-gray hover:text-torg-dark">Cancelar</button>
              <button onClick={criar} disabled={criando || cliente.trim().length < 2 || servSel.length === 0}
                className="px-4 py-2 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-blue-700 font-medium inline-flex items-center gap-2 disabled:opacity-50">
                {criando ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Criar e abrir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
