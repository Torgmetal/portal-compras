"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { upload } from "@vercel/blob/client";
import Link from "next/link";
import {
  Loader2, AlertCircle, ArrowLeft, Building2, Upload, Search, X, FileText, Trash2,
  Send, Copy, ExternalLink, Save, ClipboardList, FolderOpen, CheckCircle2,
  Sparkles, Plus, Mail, Eye, Image as ImageIcon, ClipboardCheck, BookOpen,
  ScrollText, FileDown, ImagePlus, Stamp, Users, ChevronDown,
} from "lucide-react";
import { SECOES_AUDITORIA, ordenarSecoes, REQUISITOS_GQFQ003, STATUS_REQUISITO, requisitosDaSecao } from "@/lib/auditoria-secoes";
import { numRAE } from "@/lib/auditoria-externa";
import { TIPOS, tipoLabel } from "@/lib/auditoria-interna";
import { COLUNAS_5W2H, STATUS_ITEM, STATUS_ITEM_OPCOES, situacaoItem, situacaoItemLabel } from "@/lib/plano-acao";

const fmtDH = (d) => (d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");

// Seções padrão (editáveis/removíveis) — semeadas quando a auditoria ainda não tem nenhuma.
const SECOES_PADRAO = SECOES_AUDITORIA.filter((s) => s !== "Outros");

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
  const [internosSel, setInternosSel] = useState([]); // e-mails internos (CC) marcados
  const [usuariosInternos, setUsuariosInternos] = useState([]);
  const [mostrarInternos, setMostrarInternos] = useState(false);
  const [secoesPortal, setSecoesPortal] = useState({}); // abas visíveis pro auditor (default: todas)
  const [salvandoSecoes, setSalvandoSecoes] = useState(false);
  const SECOES_PORTAL = [
    { key: "estrutura", label: "Estrutura" }, { key: "maquinas", label: "Máquinas" },
    { key: "equipe", label: "Equipe" }, { key: "modelo", label: "Data Book modelo" },
  ];
  const capaRef = useRef(null);
  const [enviandoCapa, setEnviandoCapa] = useState(false);
  const modeloRef = useRef(null);
  const [enviandoModelo, setEnviandoModelo] = useState(false);

  const carregar = useCallback(async () => {
    setErro("");
    try {
      const r = await fetch(`/api/qualidade/auditorias/${id}`);
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro");
      setData(j.data);
      setForm({ empresa: j.data.empresa || "", contato: j.data.contato || "", titulo: j.data.titulo || "", mensagemBoasVindas: j.data.mensagemBoasVindas || "", solicitacoes: j.data.solicitacoes || "" });
      const cfg = j.data.portalConfig && typeof j.data.portalConfig === "object" ? j.data.portalConfig : {};
      setEmailCliente((cfg.emailsCliente || []).join(", ") || j.data.clienteEmail || "");
      setInternosSel(Array.isArray(cfg.emailsInternos) ? cfg.emailsInternos : []);
      setSecoesPortal(cfg.secoes && typeof cfg.secoes === "object" ? cfg.secoes : {});
    } catch (e) { setErro(e.message); } finally { setLoading(false); }
  }, [id]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    fetch("/api/qualidade/auditorias/destinatarios").then((r) => r.json()).then((j) => { if (j.success) setUsuariosInternos(j.usuarios || []); }).catch(() => {});
  }, []);

  // Semeia as seções padrão na 1ª vez (auditoria sem nenhuma seção ainda).
  const seedRef = useRef(false);
  useEffect(() => {
    if (!data || seedRef.current) return;
    if ((data.itensAdicionais || []).length === 0) {
      seedRef.current = true;
      salvarItensAdicionais(SECOES_PADRAO.map((s, i) => ({ id: `sec_${i}`, titulo: s })));
    }
  }, [data]); // eslint-disable-line

  async function salvar() {
    setSalvando(true);
    try {
      const r = await fetch(`/api/qualidade/auditorias/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro");
      setData(j.data);
    } catch (e) { alert(e.message); } finally { setSalvando(false); }
  }

  async function salvarCapa(capaUrl) {
    const r = await fetch(`/api/qualidade/auditorias/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ capaUrl }) });
    const j = await r.json();
    if (!r.ok || !j.success) throw new Error(j.error || "Erro");
    setData(j.data);
  }
  async function enviarCapa(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setEnviandoCapa(true);
    try {
      const blob = await upload(file.name, file, { access: "public", handleUploadUrl: "/api/qualidade/documentos/upload-token" });
      await salvarCapa(blob.url);
    } catch (err) { alert(err.message || "Falha no upload"); } finally { setEnviandoCapa(false); if (capaRef.current) capaRef.current.value = ""; }
  }
  async function removerCapa() {
    try { await salvarCapa(null); } catch (e) { alert(e.message); }
  }

  async function enviarModelo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setEnviandoModelo(true);
    try {
      const blob = await upload(file.name, file, { access: "public", handleUploadUrl: "/api/qualidade/documentos/upload-token" });
      const r = await fetch(`/api/qualidade/auditorias/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataBookModeloUrl: blob.url }) });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro");
      setData(j.data);
    } catch (err) { alert(err.message || "Falha no upload"); } finally { setEnviandoModelo(false); if (modeloRef.current) modeloRef.current.value = ""; }
  }
  async function removerModelo() {
    const r = await fetch(`/api/qualidade/auditorias/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataBookModeloUrl: null }) });
    const j = await r.json();
    if (j.success) setData(j.data);
  }

  // Evidências adicionais (pedido a mais) — itens definidos pelo usuário; docs ligam via requisito=item.id
  async function salvarItensAdicionais(itens) {
    setData((d) => ({ ...d, itensAdicionais: itens })); // otimista
    await fetch(`/api/qualidade/auditorias/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itensAdicionais: itens }) }).catch(() => {});
  }
  function addAdicional() {
    salvarItensAdicionais([...(data.itensAdicionais || []), { id: `extra_${Date.now().toString(36)}`, titulo: "" }]);
  }
  function editarAdicionalTitulo(itemId, titulo) {
    setData((d) => ({ ...d, itensAdicionais: (d.itensAdicionais || []).map((i) => (i.id === itemId ? { ...i, titulo } : i)) }));
  }
  function editarAdicionalDescricao(itemId, descricao) {
    setData((d) => ({ ...d, itensAdicionais: (d.itensAdicionais || []).map((i) => (i.id === itemId ? { ...i, descricao } : i)) }));
  }
  function removerAdicional(itemId) {
    salvarItensAdicionais((data.itensAdicionais || []).filter((i) => i.id !== itemId));
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
    const emails = [...new Set(emailCliente.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean))];
    if (!emails.length || !emails.every((e) => /^\S+@\S+\.\S+$/.test(e))) { alert("Informe ao menos um e-mail válido do auditor (separe vários por vírgula)."); return; }
    setEnviandoEmail(true);
    try {
      const r = await fetch(`/api/qualidade/auditorias/${id}/enviar-email`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emails, internos: internosSel }) });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro");
      if (j.link) setLink(j.link);
      if (!j.enviado) alert("Link gerado, mas o e-mail não pôde ser enviado agora. Copie o link e envie manualmente.");
      else alert(`E-mail enviado (${j.destinatarios} destinatário(s)${j.cc ? " + " + j.cc + " em cópia" : ""})${j.comAnexo ? " · PDF anexo" : ""}.`);
      await carregar();
    } catch (e) { alert(e.message); } finally { setEnviandoEmail(false); }
  }

  async function toggleSecao(key) {
    const novo = { ...secoesPortal, [key]: secoesPortal[key] === false };
    setSecoesPortal(novo);
    setSalvandoSecoes(true);
    try {
      const r = await fetch(`/api/qualidade/auditorias/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secoes: { [key]: novo[key] } }) });
      if (!r.ok) throw new Error();
    } catch { setSecoesPortal(secoesPortal); alert("Não consegui salvar a seção."); } finally { setSalvandoSecoes(false); }
  }

  if (loading) return <div className="flex flex-col items-center justify-center py-24 text-torg-gray"><Loader2 size={24} className="animate-spin mb-3" /><p className="text-sm">Carregando…</p></div>;
  if (erro) return <div className="flex flex-col items-center justify-center py-20 text-center"><AlertCircle size={24} className="text-red-500 mb-3" /><p className="text-sm text-torg-dark mb-3">{erro}</p><button onClick={carregar} className="text-xs text-torg-blue hover:underline">Tentar novamente</button></div>;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const solicitacoesDocs = data.documentos.filter((d) => d.tipo === "SOLICITACAO");
  const evidenciaDocs = data.documentos.filter((d) => d.tipo === "EVIDENCIA");

  // Checklist GQ-FQ-003: progresso + agrupamento por seção
  const checklist = data.checklistJson || {};
  const reqNA = REQUISITOS_GQFQ003.filter((r) => checklist[r.id] === "NA").length;
  const reqAtend = REQUISITOS_GQFQ003.filter((r) => checklist[r.id] === "ATENDIDO").length;
  const reqBase = REQUISITOS_GQFQ003.length - reqNA;
  const reqPct = reqBase > 0 ? Math.round((reqAtend / reqBase) * 100) : 0;
  const reqGrupos = [];
  for (const r of REQUISITOS_GQFQ003) {
    const g = reqGrupos.find((x) => x[0] === r.secao);
    if (g) g[1].push(r); else reqGrupos.push([r.secao, [r]]);
  }
  // Seções criadas pelo usuário (itensAdicionais) + documentos agrupados por seção (requisito).
  const itensAdicionais = data.itensAdicionais || [];
  const secaoIds = new Set(itensAdicionais.map((i) => i.id));
  const docsPorReq = {};
  for (const d of evidenciaDocs) { const k = d.requisito || "__sem__"; (docsPorReq[k] ||= []).push(d); }
  const docsSemSecao = evidenciaDocs.filter((d) => !d.requisito || !secaoIds.has(d.requisito));
  const publicados = evidenciaDocs.filter((d) => d.publicar).length;

  return (
    <div className="max-w-3xl mx-auto">
      <Link href="/qualidade/auditorias" className="text-[11px] text-torg-gray hover:text-torg-dark inline-flex items-center gap-1 mb-2"><ArrowLeft size={12} /> Auditorias</Link>

      {/* Cabeçalho editável */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h1 className="text-base font-bold text-torg-dark inline-flex items-center gap-2 min-w-0"><Building2 size={18} className="text-torg-blue shrink-0" /> <span className="truncate">{data.empresa}</span></h1>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${data.status === "PUBLICADO" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-torg-gray"}`}>{data.status === "PUBLICADO" ? "Publicado" : "Rascunho"}</span>
        </div>

        {/* Foto de capa do portal (ex.: foto da obra) */}
        <div className="flex items-center gap-3 mb-3 pb-3 border-b border-gray-50">
          {data.capaUrl
            ? <img src={data.capaUrl} alt="capa" className="w-32 h-[72px] object-cover rounded-lg border border-gray-200 shrink-0" />
            : <div className="w-32 h-[72px] rounded-lg bg-gray-50 border border-dashed border-gray-200 flex items-center justify-center text-gray-300 shrink-0"><ImageIcon size={22} /></div>}
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-torg-dark mb-1">Foto de capa do portal {data.capaUrl ? "" : "(opcional)"}</p>
            <input ref={capaRef} type="file" accept="image/*" className="hidden" onChange={enviarCapa} />
            <div className="flex items-center gap-3">
              <button onClick={() => capaRef.current?.click()} disabled={enviandoCapa} className="text-[11px] font-medium text-torg-blue hover:text-torg-dark inline-flex items-center gap-1 disabled:opacity-50">{enviandoCapa ? <Loader2 size={12} className="animate-spin" /> : <ImageIcon size={12} />} {enviandoCapa ? "Enviando…" : data.capaUrl ? "Trocar foto" : "Enviar foto"}</button>
              {data.capaUrl && <button onClick={removerCapa} className="text-[11px] text-torg-gray hover:text-red-600">Remover</button>}
            </div>
            <p className="text-[10px] text-torg-gray mt-0.5">Aparece em destaque no topo do portal do cliente.</p>
          </div>
        </div>

        {/* Modelo do Data Book (PDF) */}
        <div className="flex items-center gap-3 mb-3 pb-3 border-b border-gray-50">
          <div className="w-32 h-[72px] rounded-lg bg-torg-blue-50/60 border border-gray-100 flex items-center justify-center text-torg-blue shrink-0"><BookOpen size={24} /></div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-torg-dark mb-1">Modelo do Data Book {data.dataBookModeloUrl ? "" : "(opcional)"}</p>
            <input ref={modeloRef} type="file" accept=".pdf" className="hidden" onChange={enviarModelo} />
            <div className="flex items-center gap-3">
              <button onClick={() => modeloRef.current?.click()} disabled={enviandoModelo} className="text-[11px] font-medium text-torg-blue hover:text-torg-dark inline-flex items-center gap-1 disabled:opacity-50">{enviandoModelo ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} {enviandoModelo ? "Enviando…" : data.dataBookModeloUrl ? "Trocar PDF" : "Enviar PDF"}</button>
              {data.dataBookModeloUrl && <a href={data.dataBookModeloUrl} target="_blank" rel="noreferrer" className="text-[11px] text-torg-blue hover:underline">ver</a>}
              {data.dataBookModeloUrl && <button onClick={removerModelo} className="text-[11px] text-torg-gray hover:text-red-600">Remover</button>}
            </div>
            <p className="text-[10px] text-torg-gray mt-0.5">PDF de exemplo pro cliente ver como será o Data Book dele.</p>
          </div>
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

      {/* Documentos para o auditor — seções livres criadas pelo usuário */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
        <div className="flex items-center justify-between gap-2 mb-1">
          <h2 className="text-sm font-bold text-torg-dark inline-flex items-center gap-1.5"><ClipboardCheck size={15} className="text-torg-blue" /> Documentos para o auditor</h2>
          <span className="text-[11px] font-bold text-torg-dark whitespace-nowrap">{publicados} de {evidenciaDocs.length} publicado{publicados === 1 ? "" : "s"}</span>
        </div>
        <p className="text-[11px] text-torg-gray mb-3">Crie as seções que quiser e anexe os arquivos onde fizer sentido (do servidor ou upload). Marque quais <b>publicar</b> — só os publicados aparecem pro auditor.</p>
        <div className="space-y-2.5">
          {itensAdicionais.map((item) => (
            <div key={item.id} className="border border-gray-100 rounded-lg p-2.5">
              <div className="flex items-center gap-2 mb-1.5">
                <input value={item.titulo} onChange={(e) => editarAdicionalTitulo(item.id, e.target.value)} onBlur={() => salvarItensAdicionais(itensAdicionais)}
                  placeholder="Nome da seção (ex.: Sistema de Gestão, Engenharia, Rastreabilidade…)"
                  className="flex-1 text-[13px] font-semibold text-torg-dark border-0 border-b border-gray-200 focus:border-torg-blue focus:ring-0 px-0 py-1 bg-transparent" />
                <button onClick={() => removerAdicional(item.id)} title="Remover seção" className="text-torg-gray hover:text-red-600 shrink-0"><Trash2 size={14} /></button>
              </div>
              <textarea value={item.descricao || ""} onChange={(e) => editarAdicionalDescricao(item.id, e.target.value)} onBlur={() => salvarItensAdicionais(itensAdicionais)}
                placeholder="Observação da seção (opcional — aparece pro auditor)" rows={2}
                className="w-full text-[11px] text-torg-gray border border-gray-200 rounded-lg px-2 py-1.5 mb-2 focus:border-torg-blue focus:ring-0 resize-y" />
              <ItemBlock auditoriaId={id} itemId={item.id} label="" secao={item.titulo || "Outros"} docs={docsPorReq[item.id] || []} onChange={carregar} />
            </div>
          ))}
          {itensAdicionais.length === 0 && <p className="text-[11px] text-torg-gray italic">Nenhuma seção ainda — clique em "Adicionar seção" abaixo.</p>}
          {docsSemSecao.length > 0 && (
            <div className="border border-dashed border-gray-200 rounded-lg p-2.5">
              <p className="text-[12px] font-semibold text-torg-gray mb-1.5">Sem seção</p>
              <ItemBlock auditoriaId={id} itemId="" label="" secao="Outros" docs={docsSemSecao} onChange={carregar} />
            </div>
          )}
        </div>
        <button onClick={addAdicional} className="mt-3 text-[12px] font-medium text-torg-blue hover:text-torg-dark inline-flex items-center gap-1.5"><Plus size={14} /> Adicionar seção</button>
      </div>

      {/* Relatório interno (constatações + plano de ação 5W2H) */}
      <RelatorioAuditoria id={id} data={data} onChange={carregar} />

      {/* Publicação + envio */}
      <div className="bg-torg-dark rounded-xl shadow-sm p-4 mb-8 text-white">
        <h2 className="text-sm font-bold inline-flex items-center gap-1.5 mb-1.5"><Send size={15} className="text-torg-orange" /> Portal do cliente</h2>

        {/* Abas que o auditor vê — Documentos sempre aparece; as demais ligam/desligam */}
        <div className="mb-3 pb-3 border-b border-white/10">
          <p className="text-[11px] text-blue-100 mb-1.5">Abas visíveis pro auditor <span className="text-blue-300">(Documentos aparece sempre):</span></p>
          <div className="flex flex-wrap gap-1.5">
            {SECOES_PORTAL.map((s) => {
              const on = secoesPortal[s.key] !== false;
              return (
                <button key={s.key} type="button" onClick={() => toggleSecao(s.key)} disabled={salvandoSecoes}
                  className={`text-[11px] font-semibold rounded-full px-2.5 py-1 inline-flex items-center gap-1 transition disabled:opacity-50 ${on ? "bg-white text-torg-dark" : "bg-white/10 text-blue-200 line-through"}`}>
                  {on ? <Eye size={11} /> : <X size={11} />} {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {data.status === "PUBLICADO" ? (
          <>
            <p className="text-[12px] text-blue-100 mb-2">Publicado · {publicados} de {evidenciaDocs.length} documento(s) publicado(s) pro auditor.</p>
            <div className="flex items-center gap-2 flex-wrap bg-white/10 rounded-lg px-3 py-2 mb-2.5">
              <span className="text-[11px] font-mono text-blue-100 break-all flex-1 min-w-[180px]">{link || (typeof window !== "undefined" ? `${window.location.origin}/portal-cliente/${data.token}` : `/portal-cliente/${data.token}`)}</span>
              <button onClick={() => navigator.clipboard?.writeText(link || `${window.location.origin}/portal-cliente/${data.token}`)} className="text-[11px] text-white inline-flex items-center gap-1 hover:text-torg-orange"><Copy size={12} /> copiar</button>
              <a href={`/portal-cliente/${data.token}`} target="_blank" rel="noreferrer" className="text-[11px] text-white inline-flex items-center gap-1 hover:text-torg-orange"><ExternalLink size={12} /> abrir</a>
              <a href={`/api/qualidade/auditorias/${id}/portal-pdf`} target="_blank" rel="noreferrer" className="text-[11px] text-white inline-flex items-center gap-1 hover:text-torg-orange"><FileDown size={12} /> índice (PDF)</a>
            </div>
          </>
        ) : (
          <p className="text-[12px] text-blue-100 mb-2.5">Envie por e-mail (publica e manda o link) ou apenas gere o link. Você pode publicar os documentos depois — só aparecem pro auditor os que estiverem marcados como <b>Publicar</b>.</p>
        )}

        <div className="space-y-2">
          <input type="text" value={emailCliente} onChange={(e) => setEmailCliente(e.target.value)} placeholder="e-mails do auditor — separe vários por vírgula"
            className="w-full text-[12px] rounded-lg px-2.5 py-1.5 bg-white text-torg-dark border border-white/20 focus:outline-none" />

          {/* Cópia (CC) para as áreas da Torg envolvidas */}
          <div>
            <button type="button" onClick={() => setMostrarInternos((v) => !v)} className="text-[11px] text-blue-100 hover:text-white inline-flex items-center gap-1">
              <Users size={12} /> Avisar áreas da Torg{internosSel.length ? ` (${internosSel.length})` : ""}
              <ChevronDown size={12} className={mostrarInternos ? "rotate-180 transition" : "transition"} />
            </button>
            {mostrarInternos && (
              <div className="mt-1.5 max-h-44 overflow-y-auto bg-white/10 rounded-lg p-2 space-y-0.5">
                {usuariosInternos.length === 0 && <p className="text-[11px] text-blue-200 px-1 py-0.5">Carregando usuários…</p>}
                {usuariosInternos.map((u) => (
                  <label key={u.id} className="flex items-center gap-2 text-[12px] text-blue-50 cursor-pointer hover:bg-white/10 rounded px-1 py-0.5">
                    <input type="checkbox" checked={internosSel.includes(u.email)} onChange={() => setInternosSel((prev) => prev.includes(u.email) ? prev.filter((e) => e !== u.email) : [...prev, u.email])} />
                    <span className="flex-1 truncate">{u.name}{u.setor ? <span className="text-blue-300"> · {u.setor}</span> : null}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={enviarEmail} disabled={enviandoEmail}
              className="text-[12px] font-semibold text-torg-dark bg-white rounded-lg px-3 py-1.5 hover:bg-blue-50 disabled:opacity-50 inline-flex items-center gap-1.5">
              {enviandoEmail ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />} {data.status === "PUBLICADO" ? "Reenviar e-mail" : "Publicar e enviar"}
            </button>
            <span className="text-[11px] text-blue-200 inline-flex items-center gap-1"><FileDown size={11} /> o índice em PDF vai anexado</span>
          </div>
        </div>
        {data.status !== "PUBLICADO" && (
          <button onClick={() => publicar(false)} disabled={publicando} className="text-[11px] text-blue-100 hover:text-white underline disabled:opacity-50 mt-2">
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

const toInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");
const TIPO_CLS = { CONFORME: "border-emerald-300 text-emerald-700", NAO_CONFORME: "border-red-300 text-red-700", MELHORIA: "border-amber-300 text-amber-700" };

// Reduz a imagem no navegador (canvas → JPEG) — mantém o Blob e o PDF leves.
function reduzImagem(file, max = 1600, q = 0.82) {
  return new Promise((res) => {
    if (!/^image\//.test(file.type)) return res(file);
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const sc = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.round(img.width * sc), h = Math.round(img.height * sc);
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      cv.getContext("2d").drawImage(img, 0, 0, w, h);
      cv.toBlob((b) => { URL.revokeObjectURL(url); res(b ? new File([b], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file); }, "image/jpeg", q);
    };
    img.onerror = () => { URL.revokeObjectURL(url); res(file); };
    img.src = url;
  });
}

// Relatório INTERNO da auditoria externa: constatações + fotos + plano de ação 5W2H + conclusão.
function RelatorioAuditoria({ id, data, onChange }) {
  const [meta, setMeta] = useState({ dataAuditoria: toInput(data.dataAuditoria), auditor: data.auditor || "", norma: data.norma || "", escopo: data.escopo || "" });
  const [constatacoes, setConstatacoes] = useState(Array.isArray(data.constatacoes) ? data.constatacoes : []);
  const [plano, setPlano] = useState(Array.isArray(data.planoAcao) ? data.planoAcao : []);
  const [fotos, setFotos] = useState(Array.isArray(data.fotos) ? data.fotos : []);
  const [conclusao, setConclusao] = useState(data.conclusao || "");
  const [salvando, setSalvando] = useState(false);
  const [subindo, setSubindo] = useState(0);
  const [ok, setOk] = useState("");
  const fotoRef = useRef(null);

  const setM = (k, v) => setMeta((p) => ({ ...p, [k]: v }));
  const setC = (i, k, v) => setConstatacoes((p) => p.map((c, j) => (j === i ? { ...c, [k]: v } : c)));
  const addC = () => setConstatacoes((p) => [...p, { tipo: "NAO_CONFORME", descricao: "" }]);
  const rmC = (i) => setConstatacoes((p) => p.filter((_, j) => j !== i));
  const setA = (i, k, v) => setPlano((p) => p.map((a, j) => (j === i ? { ...a, [k]: v } : a)));
  const addA = () => setPlano((p) => [...p, { oque: "", porque: "", onde: "", quem: "", quando: "", como: "", quanto: "", status: "A_FAZER", acompanhamento: "" }]);
  const rmA = (i) => setPlano((p) => p.filter((_, j) => j !== i));
  const setLeg = (i, v) => setFotos((p) => p.map((f, j) => (j === i ? { ...f, legenda: v } : f)));
  const rmFoto = (i) => setFotos((p) => p.filter((_, j) => j !== i));

  async function addFotos(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setSubindo((n) => n + files.length);
    for (const f of files) {
      try {
        const red = await reduzImagem(f);
        const blob = await upload(f.name.replace(/\.\w+$/, "") + ".jpg", red, { access: "public", handleUploadUrl: "/api/qualidade/documentos/upload-token" });
        setFotos((p) => [...p, { url: blob.url, legenda: "" }]);
      } catch (err) { alert(err.message || "Falha no upload da foto"); } finally { setSubindo((n) => n - 1); }
    }
    if (fotoRef.current) fotoRef.current.value = "";
  }

  async function salvar(extra = {}) {
    setSalvando(true); setOk("");
    try {
      const r = await fetch(`/api/qualidade/auditorias/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataAuditoria: meta.dataAuditoria || null, auditor: meta.auditor, norma: meta.norma, escopo: meta.escopo,
          constatacoes: constatacoes.filter((c) => (c.descricao || "").trim()),
          planoAcao: plano.filter((a) => (a.oque || "").trim()),
          fotos, conclusao, ...extra,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro ao salvar");
      setOk(extra.emitir ? "Relatório emitido." : "Relatório salvo.");
      onChange();
    } catch (e) { alert(e.message); } finally { setSalvando(false); }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h2 className="text-sm font-bold text-torg-dark inline-flex items-center gap-1.5"><ScrollText size={15} className="text-torg-blue" /> Relatório da auditoria <span className="text-[10px] font-medium text-torg-gray">(uso interno)</span></h2>
        <div className="flex items-center gap-2">
          {data.numero ? <span className="text-[11px] font-mono font-bold text-torg-blue">{numRAE(data.numero)}</span> : null}
          <a href={`/api/qualidade/auditorias/${id}/pdf`} target="_blank" rel="noreferrer" className="text-[11px] font-medium text-torg-blue hover:text-torg-dark inline-flex items-center gap-1"><FileDown size={13} /> PDF</a>
        </div>
      </div>
      <p className="text-[11px] text-torg-gray mb-3">Registro das constatações do auditor e o plano de ação da Torg. Não aparece no portal do cliente.</p>

      {/* Metadados */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <Campo label="Data da auditoria"><input type="date" value={meta.dataAuditoria} onChange={(e) => setM("dataAuditoria", e.target.value)} className="inp" /></Campo>
        <Campo label="Auditor (responsável)"><input value={meta.auditor} onChange={(e) => setM("auditor", e.target.value)} placeholder="Nome do auditor / certificadora" className="inp" /></Campo>
        <Campo label="Norma / referência"><input value={meta.norma} onChange={(e) => setM("norma", e.target.value)} placeholder="ISO 9001:2015 · NBR 16775…" className="inp" /></Campo>
        <Campo label="Objetivo / escopo"><input value={meta.escopo} onChange={(e) => setM("escopo", e.target.value)} placeholder="O que foi auditado" className="inp" /></Campo>
      </div>

      {/* Constatações */}
      <p className="text-[11px] font-semibold text-torg-gray uppercase tracking-wide mb-1.5">Constatações do auditor</p>
      <div className="space-y-2 mb-2">
        {constatacoes.map((c, i) => (
          <div key={i} className="flex items-start gap-2">
            <select value={c.tipo} onChange={(e) => setC(i, "tipo", e.target.value)} className={`shrink-0 text-[11px] font-medium rounded-lg px-1.5 py-2 border ${TIPO_CLS[c.tipo] || "border-gray-300"}`}>
              {TIPOS.map((t) => <option key={t} value={t}>{tipoLabel(t)}</option>)}
            </select>
            <textarea value={c.descricao} onChange={(e) => setC(i, "descricao", e.target.value)} rows={1} placeholder="Descrição da constatação" className="inp flex-1 resize-y" />
            <button onClick={() => rmC(i)} className="text-gray-400 hover:text-red-500 pt-2 shrink-0"><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
      <button onClick={addC} className="text-[11px] text-torg-blue hover:text-torg-dark font-medium inline-flex items-center gap-1 mb-4"><Plus size={12} /> Adicionar constatação</button>

      {/* Registro fotográfico */}
      <p className="text-[11px] font-semibold text-torg-gray uppercase tracking-wide mb-1.5">Registro fotográfico</p>
      {fotos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2">
          {fotos.map((f, i) => (
            <div key={i} className="border border-gray-100 rounded-lg p-1.5">
              <img src={f.url} alt="" className="w-full h-24 object-cover rounded mb-1 bg-gray-50" />
              <div className="flex items-center gap-1">
                <input value={f.legenda || ""} onChange={(e) => setLeg(i, e.target.value)} placeholder="Legenda" className="flex-1 text-[10px] border border-gray-200 rounded px-1 py-0.5 focus:border-torg-blue" />
                <button onClick={() => rmFoto(i)} className="text-gray-400 hover:text-red-500 shrink-0"><X size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      <input ref={fotoRef} type="file" accept="image/*" multiple className="hidden" onChange={addFotos} />
      <button onClick={() => fotoRef.current?.click()} disabled={subindo > 0} className="text-[11px] text-torg-blue hover:text-torg-dark font-medium inline-flex items-center gap-1 mb-4 disabled:opacity-50">{subindo > 0 ? <Loader2 size={12} className="animate-spin" /> : <ImagePlus size={12} />} {subindo > 0 ? `Enviando ${subindo}…` : "Adicionar fotos"}</button>

      {/* Plano de ação 5W2H */}
      <p className="text-[11px] font-semibold text-torg-gray uppercase tracking-wide mb-1.5">Plano de ação (5W2H)</p>
      <div className="space-y-3 mb-2">
        {plano.map((a, i) => {
          const sit = situacaoItem(a);
          return (
            <div key={i} className="border border-gray-100 rounded-lg p-2.5">
              <div className="flex items-start gap-2 mb-2">
                <span className="text-[11px] font-bold text-torg-gray pt-2">{i + 1}.</span>
                <textarea value={a.oque} onChange={(e) => setA(i, "oque", e.target.value)} rows={1} placeholder="O quê — a ação a executar" className="inp flex-1 resize-y font-medium" />
                <select value={a.status || "A_FAZER"} onChange={(e) => setA(i, "status", e.target.value)} className={`shrink-0 text-[11px] font-medium rounded-lg px-1.5 py-2 border`} style={{ borderColor: STATUS_ITEM[a.status]?.cor || "#cbd5e1", color: STATUS_ITEM[a.status]?.cor || "#334155" }}>
                  {STATUS_ITEM_OPCOES.map((s) => <option key={s} value={s}>{STATUS_ITEM[s].label}</option>)}
                </select>
                <button onClick={() => rmA(i)} className="text-gray-400 hover:text-red-500 pt-2 shrink-0"><Trash2 size={14} /></button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pl-5">
                {COLUNAS_5W2H.filter((col) => col.key !== "oque").map((col) => (
                  <label key={col.key} className="block">
                    <span className="text-[10px] text-torg-gray">{col.label} <span className="text-gray-300">({col.w})</span></span>
                    <input type={col.tipo === "date" ? "date" : "text"} value={a[col.key] || ""} onChange={(e) => setA(i, col.key, e.target.value)} placeholder={col.ph} className="w-full text-[11px] border border-gray-200 rounded px-1.5 py-1 focus:border-torg-blue" />
                  </label>
                ))}
              </div>
              <textarea value={a.acompanhamento || ""} onChange={(e) => setA(i, "acompanhamento", e.target.value)} rows={1} placeholder="Acompanhamento / evidência da ação (opcional)" className="inp w-full resize-y mt-2 ml-0 text-[11px]" />
              <p className="text-[10px] text-torg-gray mt-1 pl-5">Situação: <strong style={{ color: STATUS_ITEM[sit === "ATRASADO" ? "A_FAZER" : sit]?.cor || "#b91c1c" }}>{situacaoItemLabel(sit)}</strong></p>
            </div>
          );
        })}
      </div>
      <button onClick={addA} className="text-[11px] text-torg-blue hover:text-torg-dark font-medium inline-flex items-center gap-1 mb-4"><Plus size={12} /> Adicionar ação</button>

      {/* Conclusão */}
      <Campo label="Conclusão" wide><textarea value={conclusao} onChange={(e) => setConclusao(e.target.value)} rows={3} placeholder="Conclusão da auditoria" className="inp resize-y w-full" /></Campo>

      <div className="flex items-center justify-between gap-2 mt-3 flex-wrap">
        {ok ? <span className="text-[11px] text-emerald-600 inline-flex items-center gap-1"><CheckCircle2 size={12} /> {ok}</span> : <span />}
        <div className="flex items-center gap-2">
          <button onClick={() => salvar()} disabled={salvando} className="text-[12px] font-semibold text-torg-dark bg-white border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50 inline-flex items-center gap-1.5">{salvando ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Salvar</button>
          <button onClick={() => salvar({ emitir: true })} disabled={salvando} className="text-[12px] font-semibold text-white bg-torg-blue rounded-lg px-3 py-1.5 hover:bg-torg-dark disabled:opacity-50 inline-flex items-center gap-1.5"><Stamp size={13} /> {data.relatorioEmitidoEm ? "Reemitir" : "Emitir relatório"}</button>
        </div>
      </div>
    </div>
  );
}

// Seção de documentos (upload + vincular doc da Qualidade + lista)
// Bloco de um item (requisito do GQ-FQ-003 OU item adicional): lista os arquivos com
// toggle Publicar/Não publicar + anexar (upload) + trazer do Controle de Documentos.
function ItemBlock({ auditoriaId, itemId, label, secao, docs, onChange }) {
  const fileRef = useRef(null);
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState("");
  // Navegador de pastas do servidor (SharePoint — SGQ ISO 9001 / Qualidade)
  const [servidor, setServidor] = useState(false);
  const [spBase, setSpBase] = useState("sgq");
  const [spPath, setSpPath] = useState("");
  const [spItens, setSpItens] = useState([]);
  const [spLoading, setSpLoading] = useState(false);
  const [spErro, setSpErro] = useState("");
  const [spAnexando, setSpAnexando] = useState("");

  async function anexarArquivo(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setEnviando(true);
    try {
      const itens = [];
      for (let i = 0; i < files.length; i++) {
        setProgresso(`${i + 1}/${files.length}`);
        const f = files[i];
        const blob = await upload(f.name, f, { access: "public", handleUploadUrl: "/api/qualidade/documentos/upload-token" });
        itens.push({ tipo: "EVIDENCIA", secao, requisito: itemId || undefined, nome: f.name, arquivoUrl: blob.url, arquivoTipo: f.type || null, arquivoTamanho: f.size });
      }
      const r = await fetch(`/api/qualidade/auditorias/${auditoriaId}/doc`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itens }) });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro");
      await onChange();
    } catch (err) { alert(err.message || "Falha no upload"); } finally { setEnviando(false); setProgresso(""); if (fileRef.current) fileRef.current.value = ""; }
  }
  async function togglePublicar(d) {
    await fetch(`/api/qualidade/auditorias/${auditoriaId}/doc`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ docId: d.id, publicar: !d.publicar }) });
    await onChange();
  }
  async function remover(docId) {
    if (!confirm("Remover este documento?")) return;
    await fetch(`/api/qualidade/auditorias/${auditoriaId}/doc?docId=${encodeURIComponent(docId)}`, { method: "DELETE" });
    await onChange();
  }
  async function carregarPasta(path, base = spBase) {
    setSpLoading(true); setSpErro("");
    try {
      const r = await fetch(`/api/qualidade/sgq?base=${base}&path=${encodeURIComponent(path)}`);
      const j = await r.json();
      setSpPath(path);
      setSpItens(j.itens || []);
      if (j.erro) setSpErro(j.erro);
    } catch { setSpErro("Falha ao acessar o servidor."); setSpItens([]); }
    finally { setSpLoading(false); }
  }
  function trocarBase(base) { setSpBase(base); carregarPasta("", base); }
  function abrirServidor() {
    const abrir = !servidor;
    setServidor(abrir);
    if (abrir && spItens.length === 0) carregarPasta("");
  }
  function entrarPasta(nome) { carregarPasta(spPath ? `${spPath}/${nome}` : nome); }
  function voltar() { carregarPasta(spPath.split("/").slice(0, -1).join("/")); }
  async function anexarDoServidor(file) {
    setSpAnexando(file.id);
    try {
      const r = await fetch(`/api/qualidade/auditorias/${auditoriaId}/doc`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "EVIDENCIA", secao, requisito: itemId || undefined, nome: file.nome, sharepointItemId: file.id, arquivoTipo: file.mime || undefined }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro");
      await onChange();
    } catch (err) { alert(err.message); } finally { setSpAnexando(""); }
  }
  const jaAnexado = (fileId) => docs.some((d) => d.sharepointItemId === fileId);

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/40 px-2.5 py-2">
      {label && <p className="text-[12px] text-torg-dark font-medium mb-1">{label}</p>}
      {docs.length > 0 && (
        <div className="space-y-1 mb-1.5">
          {docs.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-2 bg-white rounded-md border border-gray-100 px-2 py-1 text-[12px]">
              <span className="inline-flex items-center gap-1.5 min-w-0"><FileText size={13} className="text-torg-blue shrink-0" /><span className="truncate text-torg-dark">{d.nome}</span></span>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => togglePublicar(d)} title="Mostrar ou não no portal do auditor"
                  className={`text-[10px] font-semibold rounded-full px-2 py-0.5 inline-flex items-center gap-1 transition ${d.publicar ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "bg-gray-100 text-torg-gray hover:bg-gray-200"}`}>
                  {d.publicar ? <><Eye size={11} /> Publicar</> : <><X size={11} /> Não publicar</>}
                </button>
                <button onClick={() => remover(d.id)} className="text-torg-gray hover:text-red-600"><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={abrirServidor} className="text-[11px] font-medium text-torg-blue hover:text-torg-dark inline-flex items-center gap-1"><Search size={12} /> Buscar do servidor</button>
        <input ref={fileRef} type="file" multiple className="hidden" onChange={anexarArquivo} accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.msg,.eml" />
        <button onClick={() => fileRef.current?.click()} disabled={enviando} className="text-[11px] font-medium text-torg-gray hover:text-torg-dark inline-flex items-center gap-1 disabled:opacity-50">{enviando ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} {enviando ? `Enviando ${progresso}…` : "Anexar arquivo"}</button>
      </div>
      {servidor && (
        <div className="mt-1.5 border border-gray-100 rounded-lg p-2 bg-white">
          <div className="flex items-center gap-1.5 mb-1.5">
            {[["sgq", "SGQ ISO 9001"], ["qualidade", "Qualidade"]].map(([k, lbl]) => (
              <button key={k} onClick={() => trocarBase(k)} className={`text-[10px] font-medium rounded-full px-2 py-0.5 transition ${spBase === k ? "bg-torg-blue text-white" : "bg-gray-100 text-torg-gray hover:bg-gray-200"}`}>{lbl}</button>
            ))}
          </div>
          <div className="flex items-center gap-2 mb-1.5 text-[11px]">
            <button onClick={voltar} disabled={!spPath || spLoading} className="text-torg-blue disabled:opacity-40 inline-flex items-center gap-1 shrink-0"><ArrowLeft size={12} /> voltar</button>
            <span className="text-torg-gray truncate">{spBase === "qualidade" ? "Qualidade" : "SGQ ISO 9001"}{spPath ? " / " + spPath.replace(/\//g, " / ") : ""}</span>
          </div>
          {spLoading ? (
            <p className="text-[11px] text-torg-gray inline-flex items-center gap-1 py-1"><Loader2 size={12} className="animate-spin" /> carregando…</p>
          ) : spErro ? (
            <p className="text-[11px] text-amber-600 py-1">{spErro}</p>
          ) : (
            <div className="divide-y divide-gray-50 max-h-60 overflow-y-auto">
              {spItens.length === 0 && <p className="text-[11px] text-torg-gray py-1">Pasta vazia.</p>}
              {spItens.map((it) => it.tipo === "folder" ? (
                <button key={it.id} onClick={() => entrarPasta(it.nome)} className="w-full flex items-center gap-2 px-1.5 py-1 text-[11px] hover:bg-torg-blue-50 text-left">
                  <FolderOpen size={13} className="text-torg-orange shrink-0" /><span className="truncate text-torg-dark flex-1">{it.nome}</span>
                  {it.filhos != null && <span className="text-torg-gray text-[10px] shrink-0">{it.filhos}</span>}
                </button>
              ) : (
                <div key={it.id} className="flex items-center gap-2 px-1.5 py-1 text-[11px]">
                  <FileText size={13} className="text-torg-blue shrink-0" /><span className="truncate text-torg-dark flex-1">{it.nome}</span>
                  {jaAnexado(it.id)
                    ? <span className="text-emerald-600 text-[10px] inline-flex items-center gap-1 shrink-0"><CheckCircle2 size={11} /> incluso</span>
                    : <button onClick={() => anexarDoServidor(it)} disabled={spAnexando === it.id} className="text-torg-blue hover:text-torg-dark inline-flex items-center gap-1 shrink-0 disabled:opacity-50">{spAnexando === it.id ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} anexar</button>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DocSection({ auditoriaId, tipo, titulo, docs, onChange, sugestao }) {
  const fileRef = useRef(null);
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState("");
  const [secaoUpload, setSecaoUpload] = useState(SECOES_AUDITORIA[0]);
  const [picker, setPicker] = useState(false);
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [selDocs, setSelDocs] = useState(new Set());
  const [sugerindo, setSugerindo] = useState(false);
  const [sugestoes, setSugestoes] = useState(null);

  const toggleSel = (id) => setSelDocs((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  async function adicionarSelecionados() {
    const escolhidos = (resultados || []).filter((d) => selDocs.has(d.id));
    if (!escolhidos.length) return;
    try {
      const r = await fetch(`/api/qualidade/auditorias/${auditoriaId}/doc`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itens: escolhidos.map((d) => ({ tipo, nome: d.nome, documentoId: d.id })) }) });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro");
      setPicker(false); setBusca(""); setResultados(null); setSelDocs(new Set());
      await onChange();
    } catch (err) { alert(err.message); }
  }

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
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setEnviando(true);
    try {
      const itens = [];
      for (let i = 0; i < files.length; i++) {
        setProgresso(`${i + 1}/${files.length}`);
        const f = files[i];
        const blob = await upload(f.name, f, { access: "public", handleUploadUrl: "/api/qualidade/documentos/upload-token" });
        itens.push({ tipo, secao: sugestao ? secaoUpload : undefined, nome: f.name, arquivoUrl: blob.url, arquivoTipo: f.type || null, arquivoTamanho: f.size });
      }
      const r = await fetch(`/api/qualidade/auditorias/${auditoriaId}/doc`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itens }) });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro");
      await onChange();
    } catch (err) { alert(err.message || "Falha no upload"); } finally { setEnviando(false); setProgresso(""); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function adicionarTodas() {
    const novas = (sugestoes || []).filter((s) => !s.jaAnexado);
    if (!novas.length) return;
    try {
      const r = await fetch(`/api/qualidade/auditorias/${auditoriaId}/doc`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itens: novas.map((s) => ({ tipo, secao: s.secao || undefined, requisito: s.requisito || undefined, nome: s.nome, documentoId: s.id })) }) });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro");
      setSugestoes((prev) => (prev ? prev.map((x) => ({ ...x, jaAnexado: true })) : prev));
      await onChange();
    } catch (err) { alert(err.message); }
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
      const r = await fetch(`/api/qualidade/auditorias/${auditoriaId}/doc`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo, secao: d.secao || undefined, requisito: d.requisito || undefined, nome: d.nome, documentoId: d.id }) });
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

  async function moverSecao(docId, novaSecao) {
    await fetch(`/api/qualidade/auditorias/${auditoriaId}/doc`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ docId, secao: novaSecao, requisito: null }) });
    await onChange();
  }
  async function moverRequisito(docId, requisito) {
    await fetch(`/api/qualidade/auditorias/${auditoriaId}/doc`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ docId, requisito: requisito || null }) });
    await onChange();
  }

  // Linha de um documento (com seletor de seção e de requisito quando é a área do cliente)
  const Linha = (d) => {
    const sec = SECOES_AUDITORIA.includes(d.secao) ? d.secao : "Outros";
    const reqs = requisitosDaSecao(sec);
    return (
      <div key={d.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-[12px]">
        <span className="inline-flex items-center gap-1.5 min-w-0"><FileText size={13} className="text-torg-blue shrink-0" /><span className="truncate text-torg-dark">{d.nome}</span></span>
        <div className="flex items-center gap-2 shrink-0">
          {sugestao && (
            <select value={sec} onChange={(e) => moverSecao(d.id, e.target.value)} className="text-[10px] border border-gray-200 rounded px-1 py-0.5 text-torg-gray focus:border-torg-blue max-w-[130px]">
              {SECOES_AUDITORIA.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          {sugestao && reqs.length >= 2 && (
            <select value={d.requisito || ""} onChange={(e) => moverRequisito(d.id, e.target.value)} title="Linha (requisito) que o documento atende" className="text-[10px] border border-gray-200 rounded px-1 py-0.5 text-torg-gray focus:border-torg-blue max-w-[150px]">
              <option value="">— linha —</option>
              {reqs.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          )}
          <button onClick={() => remover(d.id)} className="text-torg-gray hover:text-red-600"><Trash2 size={13} /></button>
        </div>
      </div>
    );
  };

  // Agrupa por seção (só na área do cliente / EVIDENCIA)
  const gruposDoc = (() => {
    if (!sugestao) return null;
    const m = {};
    for (const d of docs) { const s = SECOES_AUDITORIA.includes(d.secao) ? d.secao : "Outros"; (m[s] ||= []).push(d); }
    return ordenarSecoes(Object.keys(m)).map((s) => [s, m[s]]);
  })();

  return (
    <div className="mt-2">
      {titulo && <p className="text-[11px] font-semibold text-torg-gray mb-1.5">{titulo}</p>}
      {docs.length === 0 ? (
        <p className="text-[11px] text-torg-gray italic mb-2">Nenhum documento.</p>
      ) : gruposDoc ? (
        <div className="space-y-2 mb-2">
          {gruposDoc.map(([secao, lista]) => (
            <div key={secao} className="border border-gray-100 rounded-lg overflow-hidden">
              <div className="bg-gray-50/70 px-2.5 py-1 text-[10px] font-semibold text-torg-gray uppercase tracking-wide">{secao} · {lista.length}</div>
              <div className="divide-y divide-gray-50">{lista.map((d) => Linha(d))}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="divide-y divide-gray-50 border border-gray-100 rounded-lg mb-2">{docs.map((d) => Linha(d))}</div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        {sugestao && (
          <label className="text-[10px] text-torg-gray inline-flex items-center gap-1">Seção:
            <select value={secaoUpload} onChange={(e) => setSecaoUpload(e.target.value)} className="text-[10px] border border-gray-200 rounded px-1 py-0.5 text-torg-dark focus:border-torg-blue">
              {SECOES_AUDITORIA.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        )}
        <input ref={fileRef} type="file" multiple className="hidden" onChange={anexarArquivo} accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.msg,.eml" />
        <button onClick={() => fileRef.current?.click()} disabled={enviando} className="text-[11px] font-medium text-torg-blue hover:text-torg-dark inline-flex items-center gap-1 disabled:opacity-50">{enviando ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} {enviando ? `Enviando ${progresso}…` : "Anexar arquivos"}</button>
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
            <>
              <div className="divide-y divide-gray-50 max-h-52 overflow-y-auto">
                {resultados.map((d) => (
                  <label key={d.id} className="flex items-center gap-2 px-2 py-1.5 text-[11px] hover:bg-torg-blue-50 cursor-pointer">
                    <input type="checkbox" checked={selDocs.has(d.id)} onChange={() => toggleSel(d.id)} className="rounded border-gray-300 text-torg-blue focus:ring-torg-blue shrink-0" />
                    <span className="truncate text-torg-dark flex-1">{d.nome}</span>
                    <span className="text-torg-gray shrink-0 whitespace-nowrap">{d.categoria}{d.temArquivo ? "" : " · sem arquivo"}</span>
                  </label>
                ))}
              </div>
              <div className="flex items-center justify-between gap-2 mt-1.5 pt-1.5 border-t border-gray-50">
                <span className="text-[10px] text-torg-gray">{selDocs.size} selecionado(s)</span>
                <button onClick={adicionarSelecionados} disabled={selDocs.size === 0} className="text-[11px] font-semibold text-white bg-torg-blue rounded-lg px-2.5 py-1 inline-flex items-center gap-1 hover:bg-torg-dark disabled:opacity-50"><Plus size={12} /> Adicionar selecionados</button>
              </div>
            </>
          ) : <p className="text-[10px] text-torg-gray">Nenhum documento encontrado.</p>)}
        </div>
      )}

      {sugestao && sugestoes && (
        <div className="mt-2 border border-torg-blue-200 bg-torg-blue-50/40 rounded-lg p-2.5">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <p className="text-[11px] font-semibold text-torg-dark inline-flex items-center gap-1"><Sparkles size={12} className="text-torg-blue" /> Sugestões do Torguinho ({sugestoes.length})</p>
            {sugestoes.some((s) => !s.jaAnexado) && (
              <button onClick={adicionarTodas} className="text-[11px] font-semibold text-torg-blue hover:text-torg-dark inline-flex items-center gap-1"><Plus size={12} /> Adicionar todas</button>
            )}
          </div>
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
