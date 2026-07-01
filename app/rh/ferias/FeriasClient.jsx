"use client";
import { useState, useEffect, useCallback, Fragment } from "react";
import {
  CalendarDays, Loader2, AlertCircle, RefreshCw, CalendarPlus, X, Trash2,
  ChevronRight, Clock,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { valorFerias, fimGozo } from "@/lib/ferias-calc";

const fmt = (v) => (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");

const SIT = {
  VENCIDA: { label: "Vencida", cor: "bg-red-100 text-red-700" },
  A_GOZAR: { label: "A gozar", cor: "bg-green-100 text-green-700" },
  EM_AQUISICAO: { label: "Em aquisição", cor: "bg-gray-100 text-gray-600" },
};
const STATUS_F = { PROGRAMADA: "bg-blue-100 text-blue-700", GOZADA: "bg-green-100 text-green-700", CANCELADA: "bg-gray-100 text-gray-500", PENDENTE: "bg-amber-100 text-amber-700" };

export default function FeriasClient() {
  const { showToast } = useStore();
  const [linhas, setLinhas] = useState([]);
  const [resumo, setResumo] = useState({ VENCIDA: 0, A_GOZAR: 0, EM_AQUISICAO: 0 });
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState("");
  const [expandido, setExpandido] = useState(null);
  const [modal, setModal] = useState(null); // { funcionario }
  const [form, setForm] = useState({ dataInicio: "", diasGozo: 30, diasVendidos: 0, observacao: "" });
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await fetch(`/api/rh/ferias${filtro ? `?situacao=${filtro}` : ""}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao carregar");
      setLinhas(d.linhas || []);
      setResumo(d.resumo || { VENCIDA: 0, A_GOZAR: 0, EM_AQUISICAO: 0 });
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }, [filtro]);

  useEffect(() => { carregar(); }, [carregar]);

  const abrir = (func) => { setForm({ dataInicio: "", diasGozo: 30, diasVendidos: 0, observacao: "" }); setModal({ funcionario: func }); };

  const salvar = async () => {
    if (!form.dataInicio) { showToast("Informe a data de início", "error"); return; }
    setSalvando(true);
    try {
      const r = await fetch("/api/rh/ferias", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ funcionarioId: modal.funcionario.id, dataInicio: form.dataInicio, diasGozo: Number(form.diasGozo), diasVendidos: Number(form.diasVendidos), observacao: form.observacao || null }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao programar");
      showToast("Férias programadas", "success");
      setModal(null);
      await carregar();
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (id) => {
    if (!confirm("Excluir esta programação de férias?")) return;
    try {
      const r = await fetch(`/api/rh/ferias/${id}`, { method: "DELETE" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao excluir");
      showToast("Programação excluída", "success");
      await carregar();
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  const chip = (sit) => (
    <button onClick={() => setFiltro(filtro === sit ? "" : sit)}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${filtro === sit ? "ring-2 ring-torg-blue " : ""}${SIT[sit].cor} border-transparent`}>
      {resumo[sit] || 0} {SIT[sit].label.toLowerCase()}
    </button>
  );

  const val = modal ? valorFerias(modal.funcionario.salario, Number(form.diasGozo) || 0, Number(form.diasVendidos) || 0) : null;

  return (
    <div className="space-y-6 max-w-[1500px]">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2">
            <CalendarDays className="text-torg-blue" /> Férias
          </h2>
          <p className="text-sm text-torg-gray mt-1">Vencimentos por período aquisitivo (a partir da admissão), programação e valor estimado.</p>
        </div>
        <div className="flex items-center gap-2">
          {chip("VENCIDA")}{chip("A_GOZAR")}{chip("EM_AQUISICAO")}
        </div>
      </div>

      {carregando ? (
        <div className="py-16 text-center text-torg-gray"><Loader2 size={28} className="mx-auto animate-spin mb-2" /> Carregando...</div>
      ) : erro ? (
        <div className="py-16 text-center">
          <AlertCircle size={28} className="mx-auto text-red-400 mb-2" />
          <p className="text-sm text-red-600 mb-3">{erro}</p>
          <button onClick={carregar} className="px-3 py-1.5 text-sm bg-torg-blue text-white rounded-lg inline-flex items-center gap-2"><RefreshCw size={14} /> Tentar novamente</button>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50/60 border-b border-gray-100">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Funcionário</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Admissão</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Período aquisitivo</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Vence em</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-500 uppercase">Situação</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-500 uppercase">Valor est. (30d)</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-500 uppercase">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {linhas.map((l) => {
                  const p = l.periodo;
                  const sit = SIT[p?.situacao] || { label: "—", cor: "bg-gray-100" };
                  return (
                    <Fragment key={l.id}>
                      <tr className="hover:bg-gray-50">
                        <td className="px-3 py-2">
                          <div className="font-medium text-torg-dark">{l.nome}</div>
                          <div className="text-[10px] text-torg-gray">{[l.setor, l.empresa].filter(Boolean).join(" · ")}</div>
                        </td>
                        <td className="px-3 py-2 text-torg-gray">{fmtData(l.dataAdmissao)}</td>
                        <td className="px-3 py-2 text-torg-gray">{p ? `${fmtData(p.aquisInicio)} → ${fmtData(p.aquisFim)}` : "—"}</td>
                        <td className="px-3 py-2">
                          {p ? (
                            <div>
                              <div className="text-torg-dark">{fmtData(p.vencimento)}</div>
                              <div className={`text-[10px] ${p.diasParaVencer < 0 ? "text-red-600" : p.diasParaVencer <= 90 ? "text-amber-600" : "text-torg-gray"}`}>
                                {p.diasParaVencer < 0 ? `venceu há ${-p.diasParaVencer}d` : `em ${p.diasParaVencer}d`}
                              </div>
                            </div>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-2 text-center"><span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${sit.cor}`}>{sit.label}</span></td>
                        <td className="px-3 py-2 text-right tabular-nums text-torg-dark">R$ {fmt(l.valorEstimado30)}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => abrir(l)} className="text-torg-blue hover:text-torg-blue-700 inline-flex items-center gap-1"><CalendarPlus size={14} /> Programar</button>
                            {l.ferias.length > 0 && (
                              <button onClick={() => setExpandido(expandido === l.id ? null : l.id)} className="text-torg-gray hover:text-torg-dark inline-flex items-center">
                                <ChevronRight size={13} className={expandido === l.id ? "rotate-90 transition-transform" : "transition-transform"} /> {l.ferias.length}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expandido === l.id && (
                        <tr className="bg-gray-50/60">
                          <td colSpan={7} className="px-4 py-2">
                            <div className="space-y-1">
                              {l.ferias.map((fe) => (
                                <div key={fe.id} className="flex items-center gap-3 text-[11px] text-torg-gray">
                                  <span className={`px-1.5 py-0.5 rounded-full ${STATUS_F[fe.status] || "bg-gray-100"}`}>{fe.status}</span>
                                  <span>Gozo: {fmtData(fe.dataInicio)} → {fmtData(fe.dataFim)} ({fe.diasGozo}d{fe.diasVendidos ? ` + ${fe.diasVendidos} vendidos` : ""})</span>
                                  {fe.valorEstimado != null && <span>· R$ {fmt(fe.valorEstimado)}</span>}
                                  <button onClick={() => excluir(fe.id)} className="text-red-400 hover:text-red-600 ml-auto"><Trash2 size={12} /></button>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {linhas.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-torg-gray">Nenhum funcionário{filtro ? " nessa situação" : ""}.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Programar */}
      {modal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-torg-dark">Programar férias — {modal.funcionario.nome}</h3>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-red-500"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-torg-gray mb-1">Início do gozo *</label>
                  <input type="date" value={form.dataInicio} onChange={(e) => setForm({ ...form, dataInicio: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-torg-gray mb-1">Fim (calculado)</label>
                  <div className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm text-torg-dark">
                    {form.dataInicio && form.diasGozo ? fmtData(fimGozo(form.dataInicio, Number(form.diasGozo))) : "—"}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-torg-gray mb-1">Dias de gozo</label>
                  <input type="number" min="1" max="30" value={form.diasGozo} onChange={(e) => setForm({ ...form, diasGozo: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-torg-gray mb-1">Dias vendidos (abono)</label>
                  <input type="number" min="0" max="10" value={form.diasVendidos} onChange={(e) => setForm({ ...form, diasVendidos: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-torg-gray mb-1">Observação</label>
                <input type="text" value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue" />
              </div>
              {/* Valor estimado ao vivo */}
              <div className="bg-torg-blue-50/40 border border-torg-blue-100 rounded-lg p-3 text-sm">
                <div className="flex justify-between text-torg-gray"><span>Férias ({form.diasGozo}d)</span><span className="tabular-nums">R$ {fmt(val?.ferias)}</span></div>
                {Number(form.diasVendidos) > 0 && <div className="flex justify-between text-torg-gray"><span>Abono ({form.diasVendidos}d)</span><span className="tabular-nums">R$ {fmt(val?.abono)}</span></div>}
                <div className="flex justify-between text-torg-gray"><span>1/3 constitucional</span><span className="tabular-nums">R$ {fmt(val?.terco)}</span></div>
                <div className="flex justify-between font-bold text-torg-dark border-t border-torg-blue-100 mt-1 pt-1"><span>Total estimado</span><span className="tabular-nums">R$ {fmt(val?.total)}</span></div>
              </div>
              <p className="text-[11px] text-torg-gray flex items-center gap-1"><Clock size={12} /> Valor é estimativa (salário + 1/3 + abono) — não substitui o cálculo da folha.</p>
            </div>
            <div className="p-5 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm text-torg-gray border border-gray-200 rounded-lg hover:bg-gray-50">Cancelar</button>
              <button onClick={salvar} disabled={salvando || !form.dataInicio}
                className="px-4 py-2 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-blue-700 font-medium inline-flex items-center gap-2 disabled:opacity-50">
                {salvando ? <Loader2 size={16} className="animate-spin" /> : <CalendarPlus size={16} />} Programar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
