"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, AlertCircle, Plus, ClipboardCheck, X, Building2, FileText, ChevronRight } from "lucide-react";

const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

export default function AuditoriasClient() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [modal, setModal] = useState(false);

  const carregar = useCallback(async () => {
    setErro("");
    try {
      const r = await fetch("/api/qualidade/auditorias");
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro");
      setData(j.data);
    } catch (e) { setErro(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-lg font-bold text-torg-dark inline-flex items-center gap-2"><ClipboardCheck size={20} className="text-torg-blue" /> Auditorias Externas</h1>
          <p className="text-xs text-torg-gray mt-0.5">Atenda às solicitações do cliente e publique os documentos num portal exclusivo.</p>
        </div>
        <button onClick={() => setModal(true)} className="text-[12px] font-semibold text-white bg-torg-blue rounded-lg px-3 py-2 hover:bg-torg-dark inline-flex items-center gap-1.5"><Plus size={14} /> Nova auditoria</button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 text-torg-gray"><Loader2 size={24} className="animate-spin mb-3" /><p className="text-sm">Carregando…</p></div>
      ) : erro ? (
        <div className="flex flex-col items-center justify-center py-20 text-center"><AlertCircle size={24} className="text-red-500 mb-3" /><p className="text-sm text-torg-dark mb-3">{erro}</p><button onClick={carregar} className="text-xs text-torg-blue hover:underline">Tentar novamente</button></div>
      ) : data.length === 0 ? (
        <div className="text-center py-20 text-torg-gray"><ClipboardCheck size={32} className="mx-auto mb-2 text-gray-300" /><p className="text-sm">Nenhuma auditoria ainda.</p><p className="text-xs mt-1">Clique em “Nova auditoria” para começar.</p></div>
      ) : (
        <div className="space-y-2">
          {data.map((a) => (
            <Link key={a.id} href={`/qualidade/auditorias/${a.id}`} className="block bg-white rounded-xl border border-gray-100 shadow-sm p-4 hover:border-torg-blue-200 hover:shadow transition-all">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-torg-dark inline-flex items-center gap-2"><Building2 size={15} className="text-torg-gray" /> {a.empresa}</p>
                  <p className="text-xs text-torg-gray mt-0.5">{a.titulo || "Auditoria externa"}{a.contato ? ` · ${a.contato}` : ""} · criada {fmtData(a.createdAt)}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[11px] text-torg-gray inline-flex items-center gap-1"><FileText size={12} /> {a._count?.documentos ?? 0}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${a.status === "PUBLICADO" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-torg-gray"}`}>{a.status === "PUBLICADO" ? "Publicado" : "Rascunho"}</span>
                  <ChevronRight size={16} className="text-gray-300" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {modal && <NovaAuditoriaModal onClose={() => setModal(false)} onCriada={(id) => router.push(`/qualidade/auditorias/${id}`)} />}
    </div>
  );
}

function NovaAuditoriaModal({ onClose, onCriada }) {
  const [form, setForm] = useState({ empresa: "", contato: "", titulo: "", mensagemBoasVindas: "", solicitacoes: "" });
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function salvar() {
    if (form.empresa.trim().length < 2) { setErro("Informe a empresa do cliente."); return; }
    setSaving(true); setErro("");
    try {
      const r = await fetch("/api/qualidade/auditorias", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro");
      onCriada(j.id);
    } catch (e) { setErro(e.message); } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <h3 className="font-bold text-torg-dark">Nova auditoria externa</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <Campo label="Empresa do cliente *"><input value={form.empresa} onChange={(e) => set("empresa", e.target.value)} placeholder="Ex.: Actemium" className="inp" /></Campo>
          <Campo label="Pessoa de contato"><input value={form.contato} onChange={(e) => set("contato", e.target.value)} placeholder="Nome de quem vai acessar" className="inp" /></Campo>
          <Campo label="Título da auditoria"><input value={form.titulo} onChange={(e) => set("titulo", e.target.value)} placeholder="Ex.: Auditoria de Qualificação de Fornecedor 2026" className="inp" /></Campo>
          <Campo label="Mensagem de boas-vindas (aparece pro cliente)"><textarea value={form.mensagemBoasVindas} onChange={(e) => set("mensagemBoasVindas", e.target.value)} rows={2} placeholder="Seja bem-vindo à Torg Metal…" className="inp resize-y" /></Campo>
          <Campo label="Solicitações do cliente (o que ele pediu)"><textarea value={form.solicitacoes} onChange={(e) => set("solicitacoes", e.target.value)} rows={3} placeholder="Cole aqui o e-mail/lista de documentos solicitados…" className="inp resize-y" /></Campo>
          {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2 flex items-center gap-2"><AlertCircle size={14} /> {erro}</div>}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-torg-gray border border-gray-200 rounded-lg">Cancelar</button>
          <button onClick={salvar} disabled={saving} className="px-4 py-1.5 text-sm bg-torg-blue text-white rounded-lg font-medium hover:bg-torg-dark disabled:opacity-50 inline-flex items-center gap-1.5">{saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Criar</button>
        </div>
      </div>
      <style jsx>{`.inp{width:100%;border:1px solid #d1d5db;border-radius:0.5rem;padding:0.5rem 0.75rem;font-size:0.8rem}.inp:focus{outline:none;border-color:#006eab;box-shadow:0 0 0 2px rgba(0,110,171,.15)}`}</style>
    </div>
  );
}

function Campo({ label, children }) {
  return <label className="block"><span className="text-[11px] font-medium text-torg-dark mb-1 block">{label}</span>{children}</label>;
}
