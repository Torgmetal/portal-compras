"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Loader2, Plus, Trash2, Upload, Link2, Send, Eye, EyeOff, Image as ImageIcon,
  FileText, Check, ExternalLink, Library, Presentation, X,
} from "lucide-react";

const TIPOS = [{ v: "CADASTRAL", l: "Cadastral" }, { v: "PORTFOLIO", l: "Portfólio" }, { v: "OUTRO", l: "Outro" }];
const chipStatus = (s) => s === "PUBLICADO" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-100 text-gray-500 border-gray-200";

async function uploadArquivo(file) {
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch("/api/upload-blob", { method: "POST", body: fd });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "Falha no upload");
  return j; // { url, nomeArquivo, tamanho, tipo }
}

export default function ApresentacoesClient() {
  const [aba, setAba] = useState("apresentacoes");
  const [msg, setMsg] = useState(null); // { ok, txt }
  const toast = (ok, txt) => { setMsg({ ok, txt }); setTimeout(() => setMsg(null), 3500); };

  return (
    <div className="max-w-5xl">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-torg-dark flex items-center gap-2"><Presentation size={20} className="text-torg-blue" /> Apresentação ao Cliente</h1>
        <p className="text-xs text-torg-gray mt-0.5">Páginas personalizadas com documentos cadastrais e portfólio da Torg — cada cliente recebe um link próprio.</p>
      </div>

      <div className="flex items-center gap-1 mb-5 border-b border-gray-200">
        {[["apresentacoes", "Apresentações", Presentation], ["biblioteca", "Documentos da Torg", Library]].map(([v, l, Ic]) => (
          <button key={v} onClick={() => setAba(v)} className={`px-3 py-2 text-sm font-semibold inline-flex items-center gap-2 border-b-2 -mb-px ${aba === v ? "border-torg-blue text-torg-blue" : "border-transparent text-torg-gray hover:text-torg-dark"}`}>
            <Ic size={15} /> {l}
          </button>
        ))}
      </div>

      {aba === "apresentacoes" ? <Apresentacoes toast={toast} /> : <Biblioteca toast={toast} />}

      {msg && (
        <div className={`fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium text-white ${msg.ok ? "bg-emerald-600" : "bg-red-600"}`}>{msg.txt}</div>
      )}
    </div>
  );
}

/* ─── Aba: Apresentações ─────────────────────────────────────── */
function Apresentacoes({ toast }) {
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState("");
  const [criando, setCriando] = useState(false);
  const [nova, setNova] = useState({ contato: "", empresa: "", clienteEmail: "" });
  const [editId, setEditId] = useState(null);

  const carregar = useCallback(() => {
    fetch("/api/compras/apresentacoes").then((r) => r.json())
      .then((j) => j.success ? setLista(j.apresentacoes) : setErro(j.error))
      .catch((e) => setErro(e.message));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function criar(e) {
    e.preventDefault();
    if (!nova.contato.trim() || !nova.empresa.trim()) return;
    setCriando(true);
    try {
      const r = await fetch("/api/compras/apresentacoes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(nova) });
      const j = await r.json();
      if (!j.success) throw new Error(j.error);
      setNova({ contato: "", empresa: "", clienteEmail: "" });
      toast(true, "Apresentação criada");
      carregar();
      setEditId(j.apresentacao.id);
    } catch (e) { toast(false, e.message); } finally { setCriando(false); }
  }

  if (erro) return <p className="text-sm text-red-600">{erro}</p>;
  if (!lista) return <div className="py-10 text-center"><Loader2 className="animate-spin text-torg-blue mx-auto" /></div>;

  return (
    <div>
      <form onSubmit={criar} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-5 grid sm:grid-cols-4 gap-3 items-end">
        <div><label className="text-[11px] font-semibold text-torg-gray uppercase">Contato</label><input value={nova.contato} onChange={(e) => setNova({ ...nova, contato: e.target.value })} placeholder="Nome da pessoa" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1" /></div>
        <div><label className="text-[11px] font-semibold text-torg-gray uppercase">Empresa</label><input value={nova.empresa} onChange={(e) => setNova({ ...nova, empresa: e.target.value })} placeholder="Empresa do cliente" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1" /></div>
        <div><label className="text-[11px] font-semibold text-torg-gray uppercase">E-mail (opcional)</label><input value={nova.clienteEmail} onChange={(e) => setNova({ ...nova, clienteEmail: e.target.value })} placeholder="cliente@empresa.com" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1" /></div>
        <button disabled={criando} className="bg-torg-blue text-white rounded-lg px-4 py-2 text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50">{criando ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Nova</button>
      </form>

      {lista.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-sm text-torg-gray">Nenhuma apresentação ainda. Crie a primeira acima.</div>
      ) : (
        <div className="space-y-2">
          {lista.map((a) => (
            <div key={a.id} className="bg-white rounded-xl border border-gray-100 shadow-sm">
              <div className="flex items-center gap-3 p-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2"><span className="font-semibold text-torg-dark truncate">{a.empresa}</span><span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${chipStatus(a.status)}`}>{a.status === "PUBLICADO" ? "Publicada" : "Rascunho"}</span></div>
                  <p className="text-xs text-torg-gray">{a.contato}{a.clienteEmail ? ` · ${a.clienteEmail}` : ""} · {a._count.documentos} extra(s){a.status === "PUBLICADO" ? ` · ${a.acessos} acesso(s)` : ""}</p>
                </div>
                <button onClick={() => setEditId(editId === a.id ? null : a.id)} className="text-sm font-semibold text-torg-blue border border-torg-blue/30 hover:bg-torg-blue-50 rounded-lg px-3 py-1.5">{editId === a.id ? "Fechar" : "Editar"}</button>
              </div>
              {editId === a.id && <Editor id={a.id} toast={toast} onChange={carregar} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Editor de uma apresentação ─────────────────────────────── */
function Editor({ id, toast, onChange }) {
  const [d, setD] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [subindo, setSubindo] = useState("");

  const carregar = useCallback(() => {
    fetch(`/api/compras/apresentacoes/${id}`).then((r) => r.json()).then((j) => j.success && setD(j));
  }, [id]);
  useEffect(() => { carregar(); }, [carregar]);

  if (!d) return <div className="p-6 border-t border-gray-100"><Loader2 className="animate-spin text-torg-blue mx-auto" /></div>;
  const a = d.apresentacao;
  const selecionados = new Set(Array.isArray(a.docsInstitucionaisIds) ? a.docsInstitucionaisIds : []);

  async function patch(body, aviso) {
    setSalvando(true);
    try {
      const r = await fetch(`/api/compras/apresentacoes/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!j.success) throw new Error(j.error);
      if (aviso) toast(true, aviso);
      carregar(); onChange();
    } catch (e) { toast(false, e.message); } finally { setSalvando(false); }
  }

  async function subirCapa(file) {
    if (!file) return; setSubindo("capa");
    try { const up = await uploadArquivo(file); await patch({ capaUrl: up.url }); toast(true, "Imagem de capa atualizada"); }
    catch (e) { toast(false, e.message); } finally { setSubindo(""); }
  }
  async function subirExtra(file) {
    if (!file) return; setSubindo("extra");
    try {
      const up = await uploadArquivo(file);
      const r = await fetch(`/api/compras/apresentacoes/${id}/docs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: up.nomeArquivo, tipo: "OUTRO", arquivoUrl: up.url, arquivoTipo: up.tipo, arquivoTamanho: up.tamanho }) });
      const j = await r.json(); if (!j.success) throw new Error(j.error);
      toast(true, "Documento adicionado"); carregar();
    } catch (e) { toast(false, e.message); } finally { setSubindo(""); }
  }
  async function removerExtra(docId) {
    await fetch(`/api/compras/apresentacoes/${id}/docs?docId=${docId}`, { method: "DELETE" }); carregar();
  }
  function toggleDoc(docId) {
    const novo = new Set(selecionados); novo.has(docId) ? novo.delete(docId) : novo.add(docId);
    patch({ docsInstitucionaisIds: [...novo] });
  }
  async function enviar() {
    const email = prompt("E-mail do cliente:", a.clienteEmail || "");
    if (!email) return;
    setSalvando(true);
    try {
      const r = await fetch(`/api/compras/apresentacoes/${id}/enviar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const j = await r.json(); if (!j.success) throw new Error(j.error);
      toast(true, "E-mail enviado ao cliente"); carregar(); onChange();
    } catch (e) { toast(false, e.message); } finally { setSalvando(false); }
  }
  const link = a.token ? `${window.location.origin}/apresentacao/${a.token}` : null;

  return (
    <div className="border-t border-gray-100 p-4 grid md:grid-cols-2 gap-5 bg-gray-50/40">
      {/* Coluna 1: dados + capa */}
      <div className="space-y-3">
        <Campo label="Contato" val={a.contato} onBlur={(v) => v !== a.contato && patch({ contato: v })} />
        <Campo label="Empresa" val={a.empresa} onBlur={(v) => v !== a.empresa && patch({ empresa: v })} />
        <div>
          <label className="text-[11px] font-semibold text-torg-gray uppercase">Mensagem de boas-vindas</label>
          <textarea defaultValue={a.mensagemBoasVindas || ""} onBlur={(e) => e.target.value !== (a.mensagemBoasVindas || "") && patch({ mensagemBoasVindas: e.target.value })} rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1" placeholder="Olá! Preparamos esta apresentação da Torg Metal…" />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-torg-gray uppercase block mb-1">Imagem de capa</label>
          <div className="flex items-center gap-3">
            <div className="w-24 h-14 rounded-lg bg-gray-100 border border-gray-200 overflow-hidden grid place-items-center flex-none">
              {a.capaUrl ? <img src={a.capaUrl} alt="capa" className="w-full h-full object-cover" /> : <ImageIcon size={18} className="text-gray-300" />}
            </div>
            <label className="text-sm font-semibold text-torg-blue border border-torg-blue/30 hover:bg-torg-blue-50 rounded-lg px-3 py-1.5 cursor-pointer inline-flex items-center gap-2">
              {subindo === "capa" ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Trocar
              <input type="file" accept="image/*" className="hidden" onChange={(e) => subirCapa(e.target.files?.[0])} />
            </label>
          </div>
        </div>
      </div>

      {/* Coluna 2: docs + publicar */}
      <div className="space-y-4">
        <div>
          <p className="text-[11px] font-semibold text-torg-gray uppercase mb-1.5">Documentos da Torg (biblioteca)</p>
          {d.biblioteca.length === 0 ? <p className="text-xs text-torg-gray">Nenhum documento na biblioteca. Cadastre em "Documentos da Torg".</p> : (
            <div className="space-y-1 max-h-40 overflow-auto pr-1">
              {d.biblioteca.map((doc) => (
                <label key={doc.id} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
                  <input type="checkbox" checked={selecionados.has(doc.id)} onChange={() => toggleDoc(doc.id)} className="accent-torg-blue" />
                  <span className="text-torg-dark truncate">{doc.nome}</span>
                  <span className="text-[10px] text-torg-gray uppercase ml-auto">{doc.tipo}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[11px] font-semibold text-torg-gray uppercase">Extras deste cliente</p>
            <label className="text-xs font-semibold text-torg-blue cursor-pointer inline-flex items-center gap-1">{subindo === "extra" ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Adicionar<input type="file" className="hidden" onChange={(e) => subirExtra(e.target.files?.[0])} /></label>
          </div>
          {a.documentos.length === 0 ? <p className="text-xs text-torg-gray">Sem extras.</p> : a.documentos.map((doc) => (
            <div key={doc.id} className="flex items-center gap-2 text-sm py-0.5"><FileText size={13} className="text-torg-gray" /><span className="truncate flex-1">{doc.nome}</span><button onClick={() => removerExtra(doc.id)} className="text-gray-300 hover:text-red-500"><Trash2 size={13} /></button></div>
          ))}
        </div>

        {/* Publicar / link / enviar */}
        <div className="pt-3 border-t border-gray-200 space-y-2">
          {a.status === "PUBLICADO" ? (
            <>
              <div className="flex items-center gap-2">
                <input readOnly value={link} className="flex-1 text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white text-torg-gray" />
                <button onClick={() => { navigator.clipboard.writeText(link); toast(true, "Link copiado"); }} className="text-torg-blue border border-torg-blue/30 rounded-lg px-2 py-1.5" title="Copiar link"><Link2 size={15} /></button>
                <a href={link} target="_blank" rel="noreferrer" className="text-torg-blue border border-torg-blue/30 rounded-lg px-2 py-1.5" title="Abrir"><ExternalLink size={15} /></a>
              </div>
              <div className="flex items-center gap-2">
                <button disabled={salvando} onClick={enviar} className="flex-1 bg-torg-orange text-white rounded-lg px-3 py-2 text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"><Send size={14} /> Enviar por e-mail</button>
                <button disabled={salvando} onClick={() => patch({ acao: "despublicar" }, "Despublicada")} className="text-torg-gray border border-gray-300 rounded-lg px-3 py-2 text-sm font-semibold inline-flex items-center gap-1.5"><EyeOff size={14} /> Despublicar</button>
              </div>
              {a.enviadoEmailEm && <p className="text-[11px] text-torg-gray">Enviado em {new Date(a.enviadoEmailEm).toLocaleString("pt-BR")}</p>}
            </>
          ) : (
            <button disabled={salvando} onClick={() => patch({ acao: "publicar" }, "Publicada — link gerado")} className="w-full bg-emerald-600 text-white rounded-lg px-3 py-2 text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"><Eye size={15} /> Publicar e gerar link</button>
          )}
        </div>
      </div>
    </div>
  );
}

function Campo({ label, val, onBlur }) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-torg-gray uppercase">{label}</label>
      <input defaultValue={val} onBlur={(e) => onBlur(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1" />
    </div>
  );
}

/* ─── Aba: Biblioteca institucional ──────────────────────────── */
function Biblioteca({ toast }) {
  const [docs, setDocs] = useState(null);
  const [subindo, setSubindo] = useState(false);
  const [tipo, setTipo] = useState("CADASTRAL");

  const carregar = useCallback(() => { fetch("/api/compras/documentos-institucionais?todos=1").then((r) => r.json()).then((j) => j.success && setDocs(j.docs)); }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function subir(file) {
    if (!file) return; setSubindo(true);
    try {
      const up = await uploadArquivo(file);
      const r = await fetch("/api/compras/documentos-institucionais", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: up.nomeArquivo, tipo, arquivoUrl: up.url, arquivoTipo: up.tipo, arquivoTamanho: up.tamanho }) });
      const j = await r.json(); if (!j.success) throw new Error(j.error);
      toast(true, "Documento adicionado à biblioteca"); carregar();
    } catch (e) { toast(false, e.message); } finally { setSubindo(false); }
  }
  async function remover(id) { await fetch(`/api/compras/documentos-institucionais/${id}`, { method: "DELETE" }); carregar(); }
  async function toggle(id, ativo) { await fetch(`/api/compras/documentos-institucionais/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ativo: !ativo }) }); carregar(); }

  if (!docs) return <div className="py-10 text-center"><Loader2 className="animate-spin text-torg-blue mx-auto" /></div>;

  return (
    <div>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-5 flex items-center gap-3 flex-wrap">
        <span className="text-sm text-torg-gray">Adicionar documento institucional:</span>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">{TIPOS.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}</select>
        <label className="bg-torg-blue text-white rounded-lg px-3 py-2 text-sm font-semibold cursor-pointer inline-flex items-center gap-2">{subindo ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} Enviar arquivo<input type="file" className="hidden" onChange={(e) => subir(e.target.files?.[0])} /></label>
        <span className="text-xs text-torg-gray ml-auto">Estes documentos entram por padrão em toda apresentação nova.</span>
      </div>
      {docs.length === 0 ? <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-sm text-torg-gray">Biblioteca vazia. Envie os documentos cadastrais e o portfólio da Torg.</div> : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-50">
          {docs.map((doc) => (
            <div key={doc.id} className={`flex items-center gap-3 p-3 ${doc.ativo ? "" : "opacity-50"}`}>
              <FileText size={16} className="text-torg-gray flex-none" />
              <a href={doc.arquivoUrl} target="_blank" rel="noreferrer" className="flex-1 min-w-0 text-sm text-torg-dark truncate hover:text-torg-blue">{doc.nome}</a>
              <span className="text-[10px] text-torg-gray uppercase font-semibold">{doc.tipo}</span>
              <button onClick={() => toggle(doc.id, doc.ativo)} className="text-xs text-torg-gray border border-gray-200 rounded px-2 py-1">{doc.ativo ? "Ativo" : "Inativo"}</button>
              <button onClick={() => remover(doc.id)} className="text-gray-300 hover:text-red-500"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
