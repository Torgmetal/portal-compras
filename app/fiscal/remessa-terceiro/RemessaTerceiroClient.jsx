"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useStore } from "@/lib/store";
import { fmtOP } from "@/lib/utils";
import {
  Factory, Loader2, AlertCircle, X, FileText, Search,
  PackageOpen, ReceiptText, MinusCircle, Undo2, Truck,
} from "lucide-react";

const fmtKg = (n) => (n == null ? "—" : `${Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`);
const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const inp = "w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-torg-blue outline-none";

const ST = {
  PENDENTE: { label: "Aguardando emissão", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  EMITIDA: { label: "NF emitida", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

export default function RemessaTerceiroClient() {
  const { showToast } = useStore();
  const [remessas, setRemessas] = useState(null);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState("pendente"); // pendente | emitida | todos
  const [busca, setBusca] = useState("");
  const [emitir, setEmitir] = useState(null); // remessa em emissão

  const carregar = useCallback(() => {
    setErro("");
    fetch("/api/fiscal/remessa-terceiro?status=todos")
      .then((r) => r.json())
      .then((j) => { if (j.success) setRemessas(j.remessas); else { setRemessas([]); setErro(j.error || "Erro"); } })
      .catch(() => { setRemessas([]); setErro("Erro ao carregar"); });
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const kpis = useMemo(() => {
    const l = remessas || [];
    const pend = l.filter((r) => r.remessaStatus === "PENDENTE");
    const mesAtual = new Date().toISOString().slice(0, 7);
    return {
      pendentes: pend.length,
      pesoPendente: pend.reduce((s, r) => s + (r.pesoEnviadoKg || 0), 0),
      emitidasMes: l.filter((r) => r.remessaStatus === "EMITIDA" && String(r.nfEmitidaEm).slice(0, 7) === mesAtual).length,
    };
  }, [remessas]);

  const filtradas = useMemo(() => {
    let l = remessas || [];
    if (filtro !== "todos") l = l.filter((r) => r.remessaStatus === (filtro === "pendente" ? "PENDENTE" : "EMITIDA"));
    const q = busca.trim().toLowerCase();
    if (q) l = l.filter((r) => r.terceiro?.nome?.toLowerCase().includes(q) || r.opRefNumero?.toLowerCase().includes(q) || String(r.numero).includes(q) || r.nfNumero?.toLowerCase().includes(q));
    return l;
  }, [remessas, filtro, busca]);

  async function acao(id, payload, msgOk) {
    const res = await fetch(`/api/fiscal/remessa-terceiro/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const j = await res.json();
    if (j.success) { carregar(); showToast(msgOk, "success"); }
    else showToast(j.error || "Erro", "erro");
  }

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h2 className="text-2xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2">
          <Factory size={24} className="text-torg-orange" /> Remessa para Terceiro
        </h2>
        <p className="text-sm text-torg-gray mt-1">
          NF de remessa p/ industrialização — cada romaneio a terceiro (Expedição) pré-cria uma remessa aqui. Emita a NF e registre o número.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Kpi label="Aguardando emissão" value={String(kpis.pendentes)} sub={`${fmtKg(kpis.pesoPendente)}`} color="bg-amber-500" Icon={PackageOpen} />
        <Kpi label="Peso a remeter" value={fmtKg(kpis.pesoPendente)} sub="pendente" color="bg-torg-orange" Icon={Truck} />
        <Kpi label="NF emitidas (mês)" value={String(kpis.emitidasMes)} sub="remessas" color="bg-emerald-600" Icon={ReceiptText} />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          {[["pendente", "Aguardando"], ["emitida", "Emitidas"], ["todos", "Todas"]].map(([v, l]) => (
            <button key={v} onClick={() => setFiltro(v)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium border ${filtro === v ? "bg-torg-blue text-white border-torg-blue" : "bg-white text-torg-gray border-gray-200 hover:border-torg-blue"}`}>{l}</button>
          ))}
        </div>
        <div className="relative ml-auto min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar terceiro, OP, RT, NF…" className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {remessas === null ? (
          <p className="px-6 py-10 text-sm text-torg-gray text-center inline-flex items-center gap-2 justify-center w-full"><Loader2 size={16} className="animate-spin" /> Carregando…</p>
        ) : erro ? (
          <div className="px-6 py-10 text-center"><AlertCircle size={22} className="mx-auto text-red-400 mb-2" /><p className="text-sm text-red-600 mb-3">{erro}</p><button onClick={carregar} className="text-xs text-torg-blue hover:underline">Tentar novamente</button></div>
        ) : filtradas.length === 0 ? (
          <div className="px-6 py-12 text-center"><Factory size={28} className="mx-auto text-gray-300 mb-2" /><p className="text-sm font-semibold text-torg-dark">Nenhuma remessa {filtro === "pendente" ? "aguardando emissão" : ""}</p><p className="text-xs text-torg-gray mt-1">As remessas aparecem aqui quando a Expedição cria um romaneio a terceiro.</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[920px]">
              <thead className="bg-gray-50/60">
                <tr className="text-[11px] text-gray-500 uppercase">
                  <th className="px-3 py-2 text-left font-medium">RT</th>
                  <th className="px-3 py-2 text-left font-medium">Terceiro / CNPJ</th>
                  <th className="px-3 py-2 text-left font-medium">OP ref</th>
                  <th className="px-3 py-2 text-right font-medium">Itens</th>
                  <th className="px-3 py-2 text-right font-medium">Peso</th>
                  <th className="px-3 py-2 text-center font-medium">CFOP</th>
                  <th className="px-3 py-2 text-left font-medium">Situação</th>
                  <th className="px-3 py-2 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtradas.map((r) => {
                  const st = ST[r.remessaStatus] || ST.PENDENTE;
                  return (
                    <tr key={r.id} className="hover:bg-gray-50/60">
                      <td className="px-3 py-2 font-mono text-torg-dark text-xs whitespace-nowrap">RT-{String(r.numero).padStart(3, "0")}</td>
                      <td className="px-3 py-2">
                        <span className="text-torg-dark font-medium">{r.terceiro?.nome}</span>
                        <span className="block text-[11px] text-torg-gray">{r.terceiro?.cnpj || "sem CNPJ no cadastro"}{r.terceiro?.uf ? ` · ${r.terceiro.uf}` : ""}{r.servico ? ` · ${r.servico}` : ""}</span>
                      </td>
                      <td className="px-3 py-2 text-xs font-mono text-torg-blue">{r.opRefNumero ? fmtOP(r.opRefNumero) : <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2 text-right text-torg-gray tabular-nums text-xs">{r.itensCount}{r.materiaisCount ? ` +${r.materiaisCount}mat` : ""}</td>
                      <td className="px-3 py-2 text-right text-torg-dark font-medium tabular-nums whitespace-nowrap">{fmtKg(r.pesoEnviadoKg)}</td>
                      <td className="px-3 py-2 text-center text-xs font-mono text-torg-gray">{r.cfop}</td>
                      <td className="px-3 py-2">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border whitespace-nowrap ${st.cls}`}>{st.label}</span>
                        {r.remessaStatus === "EMITIDA" && r.nfNumero && <span className="block text-[10px] text-torg-gray mt-0.5">NF {r.nfNumero}{r.nfSerie ? `/${r.nfSerie}` : ""} · {fmtD(r.nfEmitidaEm)}</span>}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                          {r.remessaStatus === "PENDENTE" ? (
                            <>
                              <button onClick={() => setEmitir(r)} className="text-xs font-semibold text-white bg-torg-blue hover:bg-torg-dark px-2.5 py-1 rounded-lg inline-flex items-center gap-1"><ReceiptText size={12} /> Emitir NF</button>
                              <button onClick={() => acao(r.id, { acao: "dispensar" }, "Remessa dispensada")} title="Não precisa de NF" className="text-torg-gray hover:text-red-600 p-1"><MinusCircle size={14} /></button>
                            </>
                          ) : (
                            <button onClick={() => acao(r.id, { acao: "reabrir" }, "Remessa reaberta")} title="Reabrir (corrigir NF)" className="text-xs text-torg-blue hover:text-torg-dark border border-torg-blue-100 rounded-lg px-2 py-1 inline-flex items-center gap-1"><Undo2 size={12} /> Reabrir</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {emitir && <ModalEmitir remessa={emitir} onClose={() => setEmitir(null)} onSalvo={() => { setEmitir(null); carregar(); showToast("NF de remessa registrada", "success"); }} />}
    </div>
  );
}

function Kpi({ label, value, sub, color, Icon }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-3">
      <div className={`${color} p-2.5 rounded-lg`}><Icon size={20} className="text-white" /></div>
      <div className="min-w-0"><p className="text-xs text-torg-gray truncate">{label}</p><p className="text-xl font-extrabold text-torg-dark tabular-nums truncate">{value}</p>{sub && <p className="text-[10px] text-torg-gray truncate">{sub}</p>}</div>
    </div>
  );
}

function ModalEmitir({ remessa, onClose, onSalvo }) {
  const [f, setF] = useState({
    cfop: remessa.cfop || remessa.cfopSugerido || "5901",
    natureza: remessa.natureza || "Remessa para industrialização",
    nfNumero: remessa.nfNumero || "",
    nfSerie: remessa.nfSerie || "",
    nfChave: remessa.nfChave || "",
    observacao: remessa.observacao || "",
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  async function salvar() {
    setErro("");
    if (!f.nfNumero.trim()) return setErro("Informe o número da NF.");
    setSalvando(true);
    try {
      const res = await fetch(`/api/fiscal/remessa-terceiro/${remessa.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "registrar", ...f }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error || "Erro");
      onSalvo();
    } catch (e) { setErro(e.message); setSalvando(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg my-8">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-torg-dark flex items-center gap-2"><ReceiptText size={16} className="text-torg-blue" /> Emitir NF de remessa — RT-{String(remessa.numero).padStart(3, "0")}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2"><AlertCircle size={14} className="mt-0.5" /><span>{erro}</span></div>}
          <div className="bg-gray-50 rounded-lg p-3 text-xs text-torg-gray">
            <p><strong className="text-torg-dark">{remessa.terceiro?.nome}</strong> · {remessa.terceiro?.cnpj || "sem CNPJ"}{remessa.terceiro?.uf ? ` · ${remessa.terceiro.uf}` : ""}</p>
            <p className="mt-0.5">{remessa.itensCount} peça(s){remessa.materiaisCount ? ` + ${remessa.materiaisCount} material(is)` : ""} · {fmtKg(remessa.pesoEnviadoKg)}{remessa.opRefNumero ? ` · OP ${remessa.opRefNumero}` : ""}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-torg-dark mb-1">CFOP</label><input value={f.cfop} onChange={(e) => set("cfop", e.target.value)} className={inp} /></div>
            <div><label className="block text-xs font-medium text-torg-dark mb-1">Natureza da operação</label><input value={f.natureza} onChange={(e) => set("natureza", e.target.value)} className={inp} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-torg-dark mb-1">Nº da NF *</label><input value={f.nfNumero} onChange={(e) => set("nfNumero", e.target.value)} className={inp} /></div>
            <div><label className="block text-xs font-medium text-torg-dark mb-1">Série</label><input value={f.nfSerie} onChange={(e) => set("nfSerie", e.target.value)} className={inp} /></div>
          </div>
          <div><label className="block text-xs font-medium text-torg-dark mb-1">Chave de acesso (44 díg.)</label><input value={f.nfChave} onChange={(e) => set("nfChave", e.target.value)} className={inp} /></div>
          <div><label className="block text-xs font-medium text-torg-dark mb-1">Observação</label><input value={f.observacao} onChange={(e) => set("observacao", e.target.value)} placeholder="Opcional" className={inp} /></div>
          <p className="text-[11px] text-torg-gray bg-amber-50 border border-amber-100 rounded px-2.5 py-1.5">Emissão integrada com o Omie (1 clique) está prevista — por ora, emita a NF no Omie e registre o número/chave aqui.</p>
        </div>
        <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100 text-sm">Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="px-5 py-2 bg-torg-blue text-white rounded-lg hover:bg-torg-dark text-sm font-medium flex items-center gap-2 disabled:opacity-50">{salvando && <Loader2 size={14} className="animate-spin" />} Registrar emissão</button>
        </div>
      </div>
    </div>
  );
}
