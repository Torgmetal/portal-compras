"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Plus, Loader2, X, AlertCircle, CheckCircle2, CalendarDays, FileText } from "lucide-react";
import { numRAI, SETORES_AUDITORIA, STATUS_AI, statusAiLabel } from "@/lib/auditoria-interna";

const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");

export default function AuditoriasInternasClient() {
  const router = useRouter();
  const [aba, setAba] = useState("cronograma");
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [modal, setModal] = useState(false);

  const carregar = useCallback(() => {
    setLoading(true);
    fetch("/api/qualidade/auditorias-internas").then((r) => (r.ok ? r.json() : null))
      .then((j) => setItens(j?.auditorias || [])).catch(() => setErro("Erro ao carregar")).finally(() => setLoading(false));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const StatusChip = ({ s }) => <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_AI[s]?.cor || "bg-gray-100 text-gray-600"}`}>{statusAiLabel(s)}</span>;

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2"><ClipboardList className="text-torg-blue" /> Auditorias Internas</h1>
          <p className="text-xs text-torg-gray mt-0.5">Programe as auditorias dos setores e emita o relatório para divulgar ao setor auditado.</p>
        </div>
        <button onClick={() => setModal(true)} className="px-4 py-2.5 bg-torg-blue text-white rounded-lg hover:bg-torg-dark font-medium flex items-center gap-2"><Plus size={18} /> Nova auditoria</button>
      </div>

      {/* Abas */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        {[{ k: "cronograma", l: "Cronograma", icon: CalendarDays }, { k: "relatorios", l: "Relatórios", icon: FileText }].map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.k} onClick={() => setAba(t.k)}
              className={`px-4 py-2.5 text-sm font-medium inline-flex items-center gap-1.5 border-b-2 -mb-px transition-colors ${aba === t.k ? "border-torg-blue text-torg-blue" : "border-transparent text-torg-gray hover:text-torg-dark"}`}>
              <Icon size={15} /> {t.l}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="py-16 text-center text-torg-gray"><Loader2 size={26} className="mx-auto animate-spin mb-2" /> Carregando…</div>
      ) : erro ? (
        <div className="py-10 text-center text-red-600 text-sm">{erro}</div>
      ) : itens.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <ClipboardList size={38} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-torg-gray">Nenhuma auditoria ainda. Programe a primeira.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            {aba === "cronograma" ? (
              <table className="w-full text-[12px]">
                <thead className="bg-gray-50/60 text-torg-gray">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium whitespace-nowrap">Nº</th>
                    <th className="text-left px-3 py-2 font-medium whitespace-nowrap">Data</th>
                    <th className="text-left px-3 py-2 font-medium">Setor auditado</th>
                    <th className="text-left px-3 py-2 font-medium">Acompanhamento</th>
                    <th className="text-left px-3 py-2 font-medium">Auditor</th>
                    <th className="text-center px-3 py-2 font-medium whitespace-nowrap">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {itens.map((a) => (
                    <tr key={a.id} onClick={() => router.push(`/qualidade/auditorias-internas/${a.id}`)} className="hover:bg-torg-blue-50/40 cursor-pointer">
                      <td className="px-3 py-2 font-mono font-semibold text-torg-blue whitespace-nowrap">{numRAI(a.numero)}</td>
                      <td className="px-3 py-2 text-torg-dark whitespace-nowrap">{fmtD(a.dataAuditoria)}</td>
                      <td className="px-3 py-2 text-torg-dark font-medium">{a.setor}</td>
                      <td className="px-3 py-2 text-torg-gray">{a.responsavelAcompanhamento}</td>
                      <td className="px-3 py-2 text-torg-gray">{a.auditor || "—"}</td>
                      <td className="px-3 py-2 text-center"><StatusChip s={a.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-[12px]">
                <thead className="bg-gray-50/60 text-torg-gray">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium whitespace-nowrap">Nº</th>
                    <th className="text-left px-3 py-2 font-medium">Setor auditado</th>
                    <th className="text-left px-3 py-2 font-medium whitespace-nowrap">Data</th>
                    <th className="text-center px-3 py-2 font-medium whitespace-nowrap">Constatações</th>
                    <th className="text-center px-3 py-2 font-medium whitespace-nowrap">Não-conf.</th>
                    <th className="text-center px-3 py-2 font-medium whitespace-nowrap">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {itens.map((a) => (
                    <tr key={a.id} onClick={() => router.push(`/qualidade/auditorias-internas/${a.id}`)} className="hover:bg-torg-blue-50/40 cursor-pointer">
                      <td className="px-3 py-2 font-mono font-semibold text-torg-blue whitespace-nowrap">{numRAI(a.numero)}</td>
                      <td className="px-3 py-2 text-torg-dark font-medium">{a.setor}</td>
                      <td className="px-3 py-2 text-torg-gray whitespace-nowrap">{fmtD(a.dataAuditoria)}</td>
                      <td className="px-3 py-2 text-center text-torg-gray">{a.totalConstatacoes}</td>
                      <td className="px-3 py-2 text-center">{a.naoConformidades > 0 ? <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700">{a.naoConformidades}</span> : <span className="text-torg-gray">—</span>}</td>
                      <td className="px-3 py-2 text-center">{a.divulgadoEm ? <span className="text-[11px] text-emerald-600 inline-flex items-center gap-1"><CheckCircle2 size={12} /> divulgado</span> : <span className="text-[11px] text-torg-gray">{statusAiLabel(a.status)}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {modal && <ModalNova onClose={() => setModal(false)} onCriada={(id) => router.push(`/qualidade/auditorias-internas/${id}`)} />}
    </div>
  );
}

function ModalNova({ onClose, onCriada }) {
  const [f, setF] = useState({ setor: "", dataAuditoria: new Date().toISOString().slice(0, 10), responsavelAcompanhamento: "", auditor: "", norma: "", escopo: "" });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar() {
    setErro("");
    if (!f.setor.trim()) return setErro("Informe o setor auditado.");
    if (!f.responsavelAcompanhamento.trim()) return setErro("Informe o responsável pelo acompanhamento.");
    setSalvando(true);
    try {
      const r = await fetch("/api/qualidade/auditorias-internas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro ao criar");
      onCriada(j.id);
    } catch (e) { setErro(e.message); setSalvando(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-xl my-6">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-torg-dark">Programar auditoria interna</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-torg-dark mb-1">Setor auditado *</label>
              <input list="setores-auditoria" value={f.setor} onChange={(e) => set("setor", e.target.value)} placeholder="Setor ou processo" className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
              <datalist id="setores-auditoria">{SETORES_AUDITORIA.map((s) => <option key={s} value={s} />)}</datalist>
            </div>
            <div>
              <label className="block text-xs font-medium text-torg-dark mb-1">Data da auditoria *</label>
              <input type="date" value={f.dataAuditoria} onChange={(e) => set("dataAuditoria", e.target.value)} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-xs font-medium text-torg-dark mb-1">Responsável pelo acompanhamento *</label>
              <input value={f.responsavelAcompanhamento} onChange={(e) => set("responsavelAcompanhamento", e.target.value)} placeholder="Quem acompanha pelo setor" className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-xs font-medium text-torg-dark mb-1">Auditor</label>
              <input value={f.auditor} onChange={(e) => set("auditor", e.target.value)} placeholder="Auditor (líder)" className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-torg-dark mb-1">Norma / referência</label>
              <input value={f.norma} onChange={(e) => set("norma", e.target.value)} placeholder="Ex.: ISO 9001:2015, NBR 16775, PQ-00…" className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Objetivo / escopo</label>
            <textarea value={f.escopo} onChange={(e) => set("escopo", e.target.value)} rows={2} placeholder="O que será auditado (opcional)" className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
          </div>
          {erro && <p className="text-[12px] text-red-600 flex items-center gap-1"><AlertCircle size={13} /> {erro}</p>}
        </div>
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2 rounded-b-xl">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100">Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="px-4 py-1.5 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-dark font-medium flex items-center gap-1.5 disabled:opacity-50">{salvando ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Programar</button>
        </div>
      </div>
    </div>
  );
}
