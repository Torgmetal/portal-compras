"use client";
import { useEffect, useState } from "react";
import { Send, X, Loader2, CheckCircle2, Plus } from "lucide-react";

// Divulga o aditivo aos setores — seleção POR PESSOA, agrupada por setor (mesmo modal do Kick Off).
// Quem recebe ganha e-mail + PDF + botão de aceite; o painel "Kick Offs — Aceites" cobra quem falta.
export default function ModalDivulgarAditivo({ aditivo, onClose, onEnviado }) {
  const [setores, setSetores] = useState(null);
  const [marcados, setMarcados] = useState(new Set());
  const [extras, setExtras] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    fetch("/api/comercial/kickoff-destinatarios").then((r) => r.json()).then((j) => {
      const lista = j.setores || [];
      setSetores(lista);
      // pré-marca os setores de produção + fiscal/financeiro: é quem o aditivo muda
      const alvo = new Set(["ENGENHARIA", "PLANEJAMENTO", "PCP", "PRODUCAO", "QUALIDADE", "EXPEDICAO", "COMPRAS", "FINANCEIRO", "FISCAL"]);
      setMarcados(new Set(lista.filter((s) => alvo.has(s.modulo)).flatMap((s) => s.emails.map((e) => e.email))));
    }).catch(() => setSetores([]));
  }, []);

  const toggleEmail = (email) => setMarcados((p) => { const n = new Set(p); if (n.has(email)) n.delete(email); else n.add(email); return n; });
  const toggleSetor = (s) => setMarcados((p) => { const n = new Set(p); const todos = s.emails.every((e) => n.has(e.email)); s.emails.forEach((e) => (todos ? n.delete(e.email) : n.add(e.email))); return n; });
  const emailsSelecionados = () => { const out = new Set(marcados); extras.split(/[,;]/).map((s) => s.trim()).filter(Boolean).forEach((e) => out.add(e)); return [...out]; };
  const total = emailsSelecionados().length;

  const enviar = async () => {
    setEnviando(true);
    try {
      const res = await fetch(`/api/comercial/aditivo/${aditivo.id}/divulgar`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ para: emailsSelecionados().join(", "), mensagem: mensagem.trim() || null }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Erro ao enviar");
      setOk(true);
      setTimeout(() => { onEnviado?.(); onClose(); }, 1200);
    } catch (e) { alert("Falha ao enviar: " + e.message); }
    finally { setEnviando(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !enviando && onClose()}>
      <div className="bg-white rounded-2xl shadow-xl max-w-xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-torg-dark flex items-center gap-2"><Send size={16} className="text-torg-orange" /> Divulgar o Aditivo {aditivo.numero} aos setores</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        {ok ? (
          <p className="text-emerald-700 text-sm flex items-center gap-2"><CheckCircle2 size={16} /> Enviado para {total} destinatário(s)!</p>
        ) : (
          <>
            <p className="text-xs text-torg-gray">Cada pessoa recebe o comunicado em PDF e um botão de aceite. Os setores de produção e o fiscal já vêm marcados.</p>
            {!setores ? (
              <p className="text-sm text-torg-gray flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Carregando cadastro…</p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {setores.map((s) => {
                  const todos = s.emails.length > 0 && s.emails.every((e) => marcados.has(e.email));
                  const algum = s.emails.some((e) => marcados.has(e.email));
                  return (
                    <div key={s.modulo} className="border border-gray-100 rounded-lg overflow-hidden">
                      <label className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer text-sm font-semibold ${todos ? "bg-torg-blue-50 text-torg-blue" : algum ? "bg-sky-50/60 text-torg-dark" : "bg-gray-50/60 text-torg-dark"}`}>
                        <input type="checkbox" checked={todos} ref={(el) => { if (el) el.indeterminate = algum && !todos; }} onChange={() => toggleSetor(s)} className="rounded border-gray-300 text-torg-blue" />
                        <span className="flex-1">{s.label}</span>
                        <span className="text-[10px] text-torg-gray font-normal">{s.emails.filter((e) => marcados.has(e.email)).length}/{s.emails.length}</span>
                      </label>
                      <div className="px-3 py-1.5 flex flex-wrap gap-1.5">
                        {s.emails.map((e) => (
                          <label key={e.email} title={e.email} className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs cursor-pointer ${marcados.has(e.email) ? "border-torg-blue bg-torg-blue-50 text-torg-blue font-medium" : "border-gray-200 text-torg-gray"}`}>
                            <input type="checkbox" checked={marcados.has(e.email)} onChange={() => toggleEmail(e.email)} className="sr-only" />
                            {marcados.has(e.email) ? <CheckCircle2 size={12} /> : <Plus size={12} />} {e.nome || e.email}
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-torg-gray mb-1">E-mails de fora do cadastro (opcional, separe por vírgula)</label>
              <input type="text" value={extras} onChange={(e) => setExtras(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" placeholder="fulano@terceiro.com.br…" />
            </div>
            <div>
              <label className="block text-xs font-medium text-torg-gray mb-1">Mensagem de abertura (opcional)</label>
              <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={2} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" placeholder="Contexto do aditivo para quem vai receber…" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-torg-gray">{total} destinatário(s)</span>
              <div className="flex gap-2">
                <button onClick={onClose} disabled={enviando} className="px-4 py-2 text-sm text-torg-gray border border-gray-200 rounded-lg hover:bg-gray-50">Cancelar</button>
                <button onClick={enviar} disabled={enviando || total === 0} className="inline-flex items-center gap-2 px-4 py-2 bg-torg-orange text-white text-sm font-medium rounded-lg disabled:opacity-50">
                  {enviando ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Divulgar
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
