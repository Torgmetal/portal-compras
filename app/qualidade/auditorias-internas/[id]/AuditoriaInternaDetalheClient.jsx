"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ClipboardList, Loader2, FileDown, Send, Trash2, Plus, X, CheckCircle2, AlertCircle, Check } from "lucide-react";
import { numRAI, SETORES_AUDITORIA, TIPO_CONSTATACAO, TIPOS, STATUS_AI, statusAiLabel } from "@/lib/auditoria-interna";

const dISO = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");
const fmtDT = (d) => (d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

export default function AuditoriaInternaDetalheClient({ id }) {
  const router = useRouter();
  const [a, setA] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");
  const [modalDiv, setModalDiv] = useState(false);

  // campos editáveis
  const [ident, setIdent] = useState({ setor: "", dataAuditoria: "", responsavelAcompanhamento: "", auditor: "", norma: "", escopo: "" });
  const [constatacoes, setConstatacoes] = useState([]);
  const [acoes, setAcoes] = useState([]);
  const [conclusao, setConclusao] = useState("");

  const carregar = useCallback(() => {
    setLoading(true);
    fetch(`/api/qualidade/auditorias-internas/${id}`).then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (!j?.auditoria) return setErro("Auditoria não encontrada");
      const x = j.auditoria;
      setA(x);
      setIdent({ setor: x.setor || "", dataAuditoria: dISO(x.dataAuditoria), responsavelAcompanhamento: x.responsavelAcompanhamento || "", auditor: x.auditor || "", norma: x.norma || "", escopo: x.escopo || "" });
      setConstatacoes(Array.isArray(x.constatacoes) ? x.constatacoes : []);
      setAcoes(Array.isArray(x.acoes) ? x.acoes : []);
      setConclusao(x.conclusao || "");
    }).catch(() => setErro("Erro ao carregar")).finally(() => setLoading(false));
  }, [id]);
  useEffect(() => { carregar(); }, [carregar]);

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(""), 2800); };
  const setId = (k, v) => setIdent((p) => ({ ...p, [k]: v }));
  const setC = (i, k, v) => setConstatacoes((p) => p.map((c, j) => (j === i ? { ...c, [k]: v } : c)));
  const setAc = (i, k, v) => setAcoes((p) => p.map((c, j) => (j === i ? { ...c, [k]: v } : c)));

  async function salvar() {
    if (!ident.setor.trim()) return setErro("Informe o setor auditado.");
    setErro(""); setSalvando(true);
    try {
      const r = await fetch(`/api/qualidade/auditorias-internas/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...ident,
          constatacoes: constatacoes.filter((c) => (c.descricao || "").trim()),
          acoes: acoes.filter((c) => (c.oque || "").trim()),
          conclusao,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro ao salvar");
      flash("Relatório salvo.");
      carregar();
    } catch (e) { setErro(e.message); } finally { setSalvando(false); }
  }

  async function excluir() {
    if (!confirm("Excluir esta auditoria e o relatório? Esta ação não pode ser desfeita.")) return;
    setSalvando(true);
    try {
      const r = await fetch(`/api/qualidade/auditorias-internas/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Erro ao excluir");
      router.push("/qualidade/auditorias-internas");
    } catch (e) { alert(e.message); setSalvando(false); }
  }

  if (loading) return <div className="py-20 text-center text-torg-gray"><Loader2 size={26} className="mx-auto animate-spin mb-2" /> Carregando…</div>;
  if (erro && !a) return <div className="py-20 text-center text-red-600 text-sm">{erro} · <Link href="/qualidade/auditorias-internas" className="text-torg-blue underline">voltar</Link></div>;

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link href="/qualidade/auditorias-internas" className="text-sm text-torg-gray hover:text-torg-blue inline-flex items-center gap-1"><ArrowLeft size={15} /> Auditorias internas</Link>
        <div className="flex items-center gap-2">
          <a href={`/api/qualidade/auditorias-internas/${id}/pdf`} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-torg-dark inline-flex items-center gap-1.5"><FileDown size={14} /> PDF</a>
          <button onClick={() => setModalDiv(true)} className="px-4 py-1.5 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-dark font-medium inline-flex items-center gap-1.5"><Send size={14} /> {a?.divulgadoEm ? "Reenviar ao setor" : "Divulgar ao setor"}</button>
          <button onClick={excluir} disabled={salvando} className="px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-red-50 hover:border-red-200 hover:text-red-600 text-torg-gray"><Trash2 size={14} /></button>
        </div>
      </div>

      {msg && <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-lg px-4 py-2.5 flex items-center gap-2"><CheckCircle2 size={15} /> {msg}</div>}

      {/* Cabeçalho */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-mono font-bold text-torg-blue text-lg">{numRAI(a.numero)}</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_AI[a.status]?.cor}`}>{statusAiLabel(a.status)}</span>
          {a.divulgadoEm && <span className="text-[11px] text-torg-gray">· divulgado em {fmtDT(a.divulgadoEm)}</span>}
        </div>
        <h1 className="text-xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2"><ClipboardList size={20} className="text-torg-blue" /> Relatório de Auditoria Interna</h1>
      </div>

      {/* Identificação */}
      <Secao titulo="Identificação">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo label="Setor auditado *">
            <input list="setores-ai" value={ident.setor} onChange={(e) => setId("setor", e.target.value)} className="inp" />
            <datalist id="setores-ai">{SETORES_AUDITORIA.map((s) => <option key={s} value={s} />)}</datalist>
          </Campo>
          <Campo label="Data da auditoria"><input type="date" value={ident.dataAuditoria} onChange={(e) => setId("dataAuditoria", e.target.value)} className="inp" /></Campo>
          <Campo label="Responsável pelo acompanhamento *"><input value={ident.responsavelAcompanhamento} onChange={(e) => setId("responsavelAcompanhamento", e.target.value)} className="inp" /></Campo>
          <Campo label="Auditor"><input value={ident.auditor} onChange={(e) => setId("auditor", e.target.value)} className="inp" /></Campo>
          <Campo label="Norma / referência"><input value={ident.norma} onChange={(e) => setId("norma", e.target.value)} placeholder="ISO 9001:2015, NBR 16775…" className="inp" /></Campo>
        </div>
        <Campo label="Objetivo / escopo"><textarea value={ident.escopo} onChange={(e) => setId("escopo", e.target.value)} rows={2} className="inp" /></Campo>
      </Secao>

      {/* Constatações */}
      <Secao titulo="Constatações" acao={<button onClick={() => setConstatacoes((p) => [...p, { tipo: "CONFORME", descricao: "" }])} className="text-[12px] text-torg-blue hover:text-torg-dark inline-flex items-center gap-1 font-medium"><Plus size={13} /> Adicionar</button>}>
        {constatacoes.length === 0 ? <p className="text-sm text-torg-gray">Nenhuma constatação. Adicione conformidades, não-conformidades e oportunidades de melhoria.</p> : (
          <div className="space-y-2.5">
            {constatacoes.map((c, i) => {
              const t = TIPO_CONSTATACAO[c.tipo] || TIPO_CONSTATACAO.CONFORME;
              return (
                <div key={i} className="rounded-lg border p-3" style={{ borderColor: t.borda, background: t.bg }}>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    {TIPOS.map((tp) => {
                      const sel = c.tipo === tp; const info = TIPO_CONSTATACAO[tp];
                      return (
                        <button key={tp} type="button" onClick={() => setC(i, "tipo", tp)}
                          className="px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors"
                          style={sel ? { background: info.cor, color: "#fff", borderColor: info.cor } : { background: "#fff", color: "#576D7E", borderColor: "#e5e7eb" }}>
                          {info.label}
                        </button>
                      );
                    })}
                    <button onClick={() => setConstatacoes((p) => p.filter((_, j) => j !== i))} className="ml-auto text-gray-300 hover:text-red-500 p-1"><Trash2 size={14} /></button>
                  </div>
                  <textarea value={c.descricao} onChange={(e) => setC(i, "descricao", e.target.value)} rows={2} placeholder="Descreva a constatação (o que foi observado, evidência)…" className="w-full text-[13px] border border-gray-200 rounded-md px-2.5 py-2 bg-white" />
                </div>
              );
            })}
          </div>
        )}
      </Secao>

      {/* Plano de ação */}
      <Secao titulo="Plano de ação" acao={<button onClick={() => setAcoes((p) => [...p, { oque: "", responsavel: "", prazo: "" }])} className="text-[12px] text-torg-blue hover:text-torg-dark inline-flex items-center gap-1 font-medium"><Plus size={13} /> Adicionar</button>}>
        {acoes.length === 0 ? <p className="text-sm text-torg-gray">Sem ações. Registre o que precisa ser feito, por quem e até quando.</p> : (
          <div className="space-y-2">
            {acoes.map((ac, i) => (
              <div key={i} className="flex items-start gap-2">
                <input value={ac.oque} onChange={(e) => setAc(i, "oque", e.target.value)} placeholder="Ação a executar" className="flex-1 min-w-0 text-[12px] border border-gray-200 rounded px-2 py-1.5" />
                <input value={ac.responsavel || ""} onChange={(e) => setAc(i, "responsavel", e.target.value)} placeholder="Responsável" className="w-32 text-[12px] border border-gray-200 rounded px-2 py-1.5" />
                <input type="date" value={ac.prazo || ""} onChange={(e) => setAc(i, "prazo", e.target.value)} className="w-32 text-[12px] border border-gray-200 rounded px-1.5 py-1.5" title="Prazo" />
                <button onClick={() => setAcoes((p) => p.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-500 p-1 mt-1"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        )}
      </Secao>

      {/* Conclusão */}
      <Secao titulo="Conclusão">
        <textarea value={conclusao} onChange={(e) => setConclusao(e.target.value)} rows={3} placeholder="Parecer geral da auditoria…" className="inp" />
      </Secao>

      {erro && <p className="text-[12px] text-red-600 flex items-center gap-1"><AlertCircle size={13} /> {erro}</p>}

      {/* Barra salvar (sticky) */}
      <div className="sticky bottom-0 bg-white/95 backdrop-blur border-t border-gray-100 -mx-8 px-8 py-3 flex justify-end">
        <button onClick={salvar} disabled={salvando} className="px-5 py-2 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-dark font-medium inline-flex items-center gap-1.5 disabled:opacity-50">{salvando ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Salvar relatório</button>
      </div>

      {modalDiv && <ModalDivulgar auditoria={a} onClose={() => setModalDiv(false)} onEnviado={() => { setModalDiv(false); flash("Relatório divulgado ao setor."); carregar(); }} />}

      <style jsx>{`.inp{width:100%;font-size:13px;border:1px solid #d1d5db;border-radius:8px;padding:8px 12px}`}</style>
    </div>
  );
}

function Secao({ titulo, acao, children }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-torg-dark">{titulo}</h3>
        {acao}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
function Campo({ label, children }) {
  return <div><label className="block text-xs font-medium text-torg-dark mb-1">{label}</label>{children}</div>;
}

function ModalDivulgar({ auditoria, onClose, onEnviado }) {
  const [emails, setEmails] = useState(auditoria?.divulgadoPara?.length ? [...new Set(auditoria.divulgadoPara.map((d) => d.email))].join(", ") : "");
  const [mensagem, setMensagem] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  async function enviar() {
    setErro("");
    const lista = emails.split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean);
    if (!lista.length) return setErro("Informe ao menos um e-mail.");
    const inval = lista.find((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
    if (inval) return setErro(`E-mail inválido: ${inval}`);
    setEnviando(true);
    try {
      const r = await fetch(`/api/qualidade/auditorias-internas/${auditoria.id}/divulgar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emails: lista, mensagem: mensagem.trim() || null }) });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro ao divulgar");
      onEnviado();
    } catch (e) { setErro(e.message); setEnviando(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg my-6">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-torg-dark flex items-center gap-2"><Send size={15} className="text-torg-blue" /> Divulgar ao setor</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-[12px] text-torg-gray">Salve o relatório antes de divulgar. Vai o <b>PDF em anexo</b> por e-mail e a auditoria é marcada como <b>emitida</b>.</p>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">E-mails do setor *</label>
            <textarea value={emails} onChange={(e) => setEmails(e.target.value)} rows={2} placeholder="email1@torg.com.br, email2@torg.com.br" className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
            <p className="text-[10px] text-torg-gray mt-1">Separe por vírgula. Cada pessoa recebe individualmente.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Mensagem (opcional)</label>
            <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={2} placeholder="Ex.: Segue o relatório da auditoria realizada no setor. Favor tratar as ações no prazo." className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
          </div>
          {erro && <p className="text-[12px] text-red-600 flex items-center gap-1"><AlertCircle size={13} /> {erro}</p>}
        </div>
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2 rounded-b-xl">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100">Cancelar</button>
          <button onClick={enviar} disabled={enviando} className="px-4 py-1.5 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-dark font-medium flex items-center gap-1.5 disabled:opacity-50">{enviando ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Enviar</button>
        </div>
      </div>
    </div>
  );
}
