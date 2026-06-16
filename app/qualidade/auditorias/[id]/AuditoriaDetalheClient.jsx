"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { upload } from "@vercel/blob/client";
import Link from "next/link";
import {
  Loader2, AlertCircle, ArrowLeft, Building2, Upload, Search, X, FileText, Trash2,
  Send, Copy, ExternalLink, Save, ClipboardList, FolderOpen, CheckCircle2,
  Sparkles, Plus, Mail, Eye,
} from "lucide-react";

const fmtDH = (d) => (d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");

export default function AuditoriaDetalheClient({ id }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [form, setForm] = useState({ empresa: "", contato: "", titulo: "", mensagemBoasVindas: "", solicitacoes: "" });
  const [salvando, setSalvando] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [link, setLink] = useState("");
  const [emailCliente, setEmailCliente] = useState("");
  const [enviandoEmail, setEnviandoEmail] = useState(false);

  const carregar = useCallback(async () => {
    setErro("");
    try {
      const r = await fetch(`/api/qualidade/auditorias/${id}`);
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro");
      setData(j.data);
      setForm({ empresa: j.data.empresa || "", contato: j.data.contato || "", titulo: j.data.titulo || "", mensagemBoasVindas: j.data.mensagemBoasVindas || "", solicitacoes: j.data.solicitacoes || "" });
    } catch (e) { setErro(e.message); } finally { setLoading(false); }
  }, [id]);
  useEffect(() => { carregar(); }, [carregar]);

  async function salvar() {
    setSalvando(true);
    try {
      const r = await fetch(`/api/qualidade/auditorias/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro");
      setData(j.data);
    } catch (e) { alert(e.message); } finally { setSalvando(false); }
  }

  async function publicar(despublicar) {
    setPublicando(true);
    try {
      const r = await fetch(`/api/qualidade/auditorias/${id}/publicar`, { method: despublicar ? "DELETE" : "POST" });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro");
      if (j.link) setLink(j.link);
      await carregar();
    } catch (e) { alert(e.message); } finally { setPublicando(false); }
  }

  async function enviarEmail() {
    if (!/^\S+@\S+\.\S+$/.test(emailCliente.trim())) { alert("Informe um e-mail válido do cliente."); return; }
    setEnviandoEmail(true);
    try {
      const r = await fetch(`/api/qualidade/auditorias/${id}/enviar-email`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: emailCliente.trim() }) });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro");
      if (j.link) setLink(j.link);
      if (!j.enviado) alert("Link gerado, mas o e-mail não pôde ser enviado agora. Copie o link e envie manualmente.");
      else alert("E-mail enviado ao cliente.");
      await carregar();
    } catch (e) { alert(e.message); } finally { setEnviandoEmail(false); }
  }

  if (loading) return <div className="flex flex-col items-center justify-center py-24 text-torg-gray"><Loader2 size={24} className="animate-spin mb-3" /><p className="text-sm">Carregando…</p></div>;
  if (erro) return <div className="flex flex-col items-center justify-center py-20 text-center"><AlertCircle size={24} className="text-red-500 mb-3" /><p className="text-sm text-torg-dark mb-3">{erro}</p><button onClick={carregar} className="text-xs text-torg-blue hover:underline">Tentar novamente</button></div>;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const solicitacoesDocs = data.documentos.filter((d) => d.tipo === "SOLICITACAO");
  const evidenciaDocs = data.documentos.filter((d) => d.tipo === "EVIDENCIA");

  return (
    <div className="max-w-3xl mx-auto">
      <Link href="/qualidade/auditorias" className="text-[11px] text-torg-gray hover:text-torg-dark inline-flex items-center gap-1 mb-2"><ArrowLeft size={12} /> Auditorias</Link>

      {/* Cabeçalho editável */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h1 className="text-base font-bold text-torg-dark inline-flex items-center gap-2 min-w-0"><Building2 size={18} className="text-torg-blue shrink-0" /> <span className="truncate">{data.empresa}</span></h1>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${data.status === "PUBLICADO" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-torg-gray"}`}>{data.status === "PUBLICADO" ? "Publicado" : "Rascunho"}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo label="Empresa"><input value={form.empresa} onChange={(e) => set("empresa", e.target.value)} className="inp" /></Campo>
          <Campo label="Pessoa de contato"><input value={form.contato} onChange={(e) => set("contato", e.target.value)} className="inp" /></Campo>
          <Campo label="Título da auditoria" wide><input value={form.titulo} onChange={(e) => set("titulo", e.target.value)} className="inp" /></Campo>
          <Campo label="Mensagem de boas-vindas (o cliente vê)" wide><textarea value={form.mensagemBoasVindas} onChange={(e) => set("mensagemBoasVindas", e.target.value)} rows={2} className="inp resize-y" /></Campo>
        </div>
        <div className="flex justify-end mt-3">
          <button onClick={salvar} disabled={salvando} className="text-[12px] font-semibold text-white bg-torg-blue rounded-lg px-3 py-1.5 hover:bg-torg-dark disabled:opacity-50 inline-flex items-center gap-1.5">{salvando ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Salvar</button>
        </div>
      </div>

      {/* Solicitações do cliente */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
        <h2 className="text-sm font-bold text-torg-dark inline-flex items-center gap-1.5 mb-2"><ClipboardList size={15} className="text-torg-blue" /> Solicitações do cliente</h2>
        <textarea value={form.solicitacoes} onChange={(e) => set("solicitacoes", e.target.value)} onBlur={salvar} rows={3} placeholder="Cole o e-mail / a lista de documentos que o cliente pediu…" className="inp resize-y w-full text-[12px]" />
        <DocSection auditoriaId={id} tipo="SOLICITACAO" titulo="Anexos da solicitação (e-mails/listas — uso interno)" docs={solicitacoesDocs} onChange={carregar} />
      </div>

      {/* Documentos compartilhados */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
        <h2 className="text-sm font-bold text-torg-dark inline-flex items-center gap-1.5 mb-1"><FolderOpen size={15} className="text-torg-blue" /> Documentos para o cliente</h2>
        <p className="text-[11px] text-torg-gray mb-2">Estes documentos aparecem no portal do cliente para conferência e download.</p>
        <DocSection auditoriaId={id} tipo="EVIDENCIA" titulo="" docs={evidenciaDocs} onChange={carregar} sugestao />
      </div>

      {/* Publicação + envio */}
      <div className="bg-torg-dark rounded-xl shadow-sm p-4 mb-8 text-white">
        <h2 className="text-sm font-bold inline-flex items-center gap-1.5 mb-1.5"><Send size={15} className="text-torg-orange" /> Portal do cliente</h2>
        {data.status === "PUBLICADO" ? (
          <>
            <p className="text-[12px] text-blue-100 mb-2">Publicado · {evidenciaDocs.length} documento(s) disponível(is).</p>
            <div className="flex items-center gap-2 flex-wrap bg-white/10 rounded-lg px-3 py-2 mb-2.5">
              <span className="text-[11px] font-mono text-blue-100 break-all flex-1 min-w-[180px]">{link || (typeof window !== "undefined" ? `${window.location.origin}/portal-cliente/${data.token}` : `/portal-cliente/${data.token}`)}</span>
              <button onClick={() => navigator.clipboard?.writeText(link || `${window.location.origin}/portal-cliente/${data.token}`)} className="text-[11px] text-white inline-flex items-center gap-1 hover:text-torg-orange"><Copy size={12} /> copiar</button>
              <a href={`/portal-cliente/${data.token}`} target="_blank" rel="noreferrer" className="text-[11px] text-white inline-flex items-center gap-1 hover:text-torg-orange"><ExternalLink size={12} /> abrir</a>
            </div>
          </>
        ) : (
          <p className="text-[12px] text-blue-100 mb-2.5">Envie por e-mail (publica e manda o link) ou apenas gere o link.{evidenciaDocs.length === 0 ? " Adicione ao menos 1 documento." : ""}</p>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <input type="email" value={emailCliente} onChange={(e) => setEmailCliente(e.target.value)} placeholder="e-mail do cliente"
            className="flex-1 min-w-[180px] text-[12px] rounded-lg px-2.5 py-1.5 bg-white text-torg-dark border border-white/20 focus:outline-none" />
          <button onClick={enviarEmail} disabled={enviandoEmail || evidenciaDocs.length === 0}
            className="text-[12px] font-semibold text-torg-dark bg-white rounded-lg px-3 py-1.5 hover:bg-blue-50 disabled:opacity-50 inline-flex items-center gap-1.5">
            {enviandoEmail ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />} {data.status === "PUBLICADO" ? "Reenviar e-mail" : "Publicar e enviar"}
          </button>
        </div>
        {data.status !== "PUBLICADO" && (
          <button onClick={() => publicar(false)} disabled={publicando || evidenciaDocs.length === 0} className="text-[11px] text-blue-100 hover:text-white underline disabled:opacity-50 mt-2">
            {publicando ? "Gerando…" : "ou só gerar o link, sem e-mail"}
          </button>
        )}

        <div className="text-[11px] text-blue-200 mt-2.5 space-y-0.5">
          {data.clienteEmail && data.enviadoEmailEm && <p className="inline-flex items-center gap-1"><Mail size={11} /> Enviado para {data.clienteEmail} em {fmtDH(data.enviadoEmailEm)}</p>}
          {data.status === "PUBLICADO" && (data.ultimoAcessoEm
            ? <p className="inline-flex items-center gap-1 text-emerald-300"><Eye size={11} /> Cliente acessou — último em {fmtDH(data.ultimoAcessoEm)}</p>
            : <p className="text-blue-300">Aguardando o primeiro acesso do cliente.</p>)}
        </div>

        {data.status === "PUBLICADO" && (
          <button onClick={() => publicar(true)} disabled={publicando} className="text-[11px] text-blue-100 hover:text-white underline disabled:opacity-50 mt-2 block">Despublicar (desativa o link)</button>
        )}
      </div>

      <style jsx global>{`.inp{width:100%;border:1px solid #d1d5db;border-radius:0.5rem;padding:0.45rem 0.7rem;font-size:0.8rem}.inp:focus{outline:none;border-color:#006eab;box-shadow:0 0 0 2px rgba(0,110,171,.15)}`}</style>
    </div>
  );
}

function Campo({ label, children, wide }) {
  return <label className={`block ${wide ? "sm:col-span-2" : ""}`}><span className="text-[11px] font-medium text-torg-dark mb-1 block">{label}</span>{children}</label>;
}

// Seção de documentos (upload + vincular doc da Qualidade + lista)
function DocSection({ auditoriaId, tipo, titulo, docs, onChange, sugestao }) {
  const fileRef = useRef(null);
  const [enviando, setEnviando] = useState(false);
  const [picker, setPicker] = useState(false);
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [sugerindo, setSugerindo] = useState(false);
  const [sugestoes, setSugestoes] = useState(null);

  async function sugerir() {
    setSugerindo(true);
    try {
      const r = await fetch(`/api/qualidade/auditorias/${auditoriaId}/sugerir-docs`, { method: "POST" });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro");
      setSugestoes(j.sugestoes || []);
    } catch (err) { alert(err.message); } finally { setSugerindo(false); }
  }

  async function anexarArquivo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setEnviando(true);
    try {
      const blob = await upload(file.name, file, { access: "public", handleUploadUrl: "/api/qualidade/documentos/upload-token" });
      const r = await fetch(`/api/qualidade/auditorias/${auditoriaId}/doc`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo, nome: file.name, arquivoUrl: blob.url, arquivoTipo: file.type || null, arquivoTamanho: file.size }) });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro");
      await onChange();
    } catch (err) { alert(err.message || "Falha no upload"); } finally { setEnviando(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function buscar(e) {
    e?.preventDefault();
    if (busca.trim().length < 2) return;
    setBuscando(true);
    try {
      const r = await fetch(`/api/qualidade/documentos?busca=${encodeURIComponent(busca.trim())}`);
      const j = await r.json();
      setResultados((j.data || []).slice(0, 12));
    } catch { setResultados([]); } finally { setBuscando(false); }
  }

  async function vincular(d) {
    try {
      const r = await fetch(`/api/qualidade/auditorias/${auditoriaId}/doc`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo, nome: d.nome, documentoId: d.id }) });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro");
      setPicker(false); setBusca(""); setResultados(null);
      setSugestoes((prev) => (prev ? prev.map((x) => (x.id === d.id ? { ...x, jaAnexado: true } : x)) : prev));
      await onChange();
    } catch (err) { alert(err.message); }
  }

  async function remover(docId) {
    if (!confirm("Remover este documento?")) return;
    await fetch(`/api/qualidade/auditorias/${auditoriaId}/doc?docId=${encodeURIComponent(docId)}`, { method: "DELETE" });
    await onChange();
  }

  return (
    <div className="mt-2">
      {titulo && <p className="text-[11px] font-semibold text-torg-gray mb-1.5">{titulo}</p>}
      {docs.length > 0 ? (
        <div className="divide-y divide-gray-50 border border-gray-100 rounded-lg mb-2">
          {docs.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-[12px]">
              <span className="inline-flex items-center gap-1.5 min-w-0"><FileText size={13} className="text-torg-blue shrink-0" /><span className="truncate text-torg-dark">{d.nome}</span></span>
              <button onClick={() => remover(d.id)} className="text-torg-gray hover:text-red-600 shrink-0"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      ) : <p className="text-[11px] text-torg-gray italic mb-2">Nenhum documento.</p>}

      <div className="flex items-center gap-3 flex-wrap">
        <input ref={fileRef} type="file" className="hidden" onChange={anexarArquivo} accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.msg,.eml" />
        <button onClick={() => fileRef.current?.click()} disabled={enviando} className="text-[11px] font-medium text-torg-blue hover:text-torg-dark inline-flex items-center gap-1 disabled:opacity-50">{enviando ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} {enviando ? "Enviando…" : "Anexar arquivo"}</button>
        <button onClick={() => setPicker((v) => !v)} className="text-[11px] font-medium text-torg-blue hover:text-torg-dark inline-flex items-center gap-1"><Search size={12} /> Trazer do Controle de Documentos</button>
        {sugestao && (
          <button onClick={sugerir} disabled={sugerindo} title="O Torguinho lê as solicitações do cliente e sugere os documentos" className="text-[11px] font-semibold text-white bg-torg-blue rounded-lg px-2.5 py-1 inline-flex items-center gap-1 hover:bg-torg-dark disabled:opacity-50">{sugerindo ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} {sugerindo ? "Analisando…" : "Sugerir documentos (IA)"}</button>
        )}
      </div>

      {picker && (
        <div className="mt-2 border border-gray-100 rounded-lg p-2">
          <form onSubmit={buscar} className="flex items-center gap-2 mb-1.5">
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="buscar por nome, norma, nº…" className="flex-1 text-[11px] border border-gray-200 rounded-lg px-2 py-1 focus:border-torg-blue" />
            <button type="submit" disabled={buscando} className="text-[11px] text-torg-blue inline-flex items-center gap-1 disabled:opacity-50">{buscando ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />} Buscar</button>
          </form>
          {resultados && (resultados.length ? (
            <div className="divide-y divide-gray-50 max-h-52 overflow-y-auto">
              {resultados.map((d) => (
                <button key={d.id} onClick={() => vincular(d)} className="w-full text-left px-2 py-1.5 text-[11px] hover:bg-torg-blue-50 flex items-center justify-between gap-2">
                  <span className="truncate text-torg-dark">{d.nome}</span>
                  <span className="text-torg-gray shrink-0 whitespace-nowrap">{d.categoria}{d.temArquivo ? "" : " · sem arquivo"}</span>
                </button>
              ))}
            </div>
          ) : <p className="text-[10px] text-torg-gray">Nenhum documento encontrado.</p>)}
        </div>
      )}

      {sugestao && sugestoes && (
        <div className="mt-2 border border-torg-blue-200 bg-torg-blue-50/40 rounded-lg p-2.5">
          <p className="text-[11px] font-semibold text-torg-dark mb-1.5 inline-flex items-center gap-1"><Sparkles size={12} className="text-torg-blue" /> Sugestões do Torguinho ({sugestoes.length})</p>
          {sugestoes.length ? (
            <div className="space-y-1.5">
              {sugestoes.map((s) => (
                <div key={s.id} className="flex items-start justify-between gap-2 bg-white rounded-lg border border-gray-100 px-2.5 py-1.5">
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium text-torg-dark truncate">{s.nome}</p>
                    {s.motivo && <p className="text-[10px] text-torg-gray leading-snug">{s.motivo}</p>}
                  </div>
                  {s.jaAnexado
                    ? <span className="text-[10px] text-emerald-600 inline-flex items-center gap-1 shrink-0"><CheckCircle2 size={11} /> já incluso</span>
                    : <button onClick={() => vincular(s)} className="text-[11px] font-medium text-torg-blue hover:text-torg-dark inline-flex items-center gap-1 shrink-0"><Plus size={12} /> adicionar</button>}
                </div>
              ))}
            </div>
          ) : <p className="text-[10px] text-torg-gray">Nenhuma sugestão — refine as solicitações ou adicione manualmente.</p>}
        </div>
      )}
    </div>
  );
}
