"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  ArrowLeft, Loader2, AlertCircle, RefreshCw, Save, FileDown, Plus, Trash2,
  ImagePlus, ChevronUp, ChevronDown, X, GripVertical, CheckCircle2, Mail, Send, Check, Users,
} from "lucide-react";
import { useStore } from "@/lib/store";

const uid = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));

// Reduz a imagem no navegador (canvas → JPEG) — mantém o Blob e o PDF leves e o
// upload rápido, e garante que só JPG entra (HEIC/webp não vão pro pdf-lib).
async function reduzImagem(file, maxDim = 1600, quality = 0.82) {
  const url = URL.createObjectURL(file);
  try {
    const img = document.createElement("img");
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error("Formato de imagem não suportado — use JPG ou PNG")); img.src = url; });
    let { width, height } = img;
    const scale = Math.min(1, maxDim / Math.max(width, height));
    width = Math.round(width * scale); height = Math.round(height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    canvas.getContext("2d").drawImage(img, 0, 0, width, height);
    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
    if (!blob) throw new Error("Falha ao processar a imagem");
    return blob;
  } finally { URL.revokeObjectURL(url); }
}

export default function RelatorioEditorClient({ id }) {
  const { showToast } = useStore();
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [titulo, setTitulo] = useState("");
  const [cliente, setCliente] = useState("");
  const [obra, setObra] = useState("");
  const [opNumero, setOpNumero] = useState("");
  const [resumo, setResumo] = useState("");
  const [status, setStatus] = useState("RASCUNHO");
  const [blocos, setBlocos] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [subindo, setSubindo] = useState(0); // fotos em upload no momento
  const fileRefs = useRef({});

  // Envio ao cliente
  const [clienteEmailOp, setClienteEmailOp] = useState("");
  const [envOpen, setEnvOpen] = useState(false);
  const [para, setPara] = useState("");
  const [ccEmails, setCcEmails] = useState([]);
  const [buscaCc, setBuscaCc] = useState("");
  const [assunto, setAssunto] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [torgEmails, setTorgEmails] = useState([]);
  const [enviando, setEnviando] = useState(false);

  const marcar = () => setDirty(true);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await fetch(`/api/relatorios/${id}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao carregar");
      const rel = d.relatorio;
      setTitulo(rel.titulo || ""); setCliente(rel.cliente || ""); setObra(rel.obra || "");
      setOpNumero(rel.opNumero || ""); setResumo(rel.resumo || ""); setStatus(rel.status || "RASCUNHO");
      setBlocos((Array.isArray(rel.blocos) ? rel.blocos : []).map((b) => ({ id: b.id || uid(), titulo: b.titulo || "", descricao: b.descricao || "", fotos: Array.isArray(b.fotos) ? b.fotos : [] })));
      setClienteEmailOp(d.clienteEmailOp || "");
      setDirty(false);
    } catch (e) { setErro(e.message); } finally { setCarregando(false); }
  }, [id]);
  useEffect(() => { carregar(); }, [carregar]);

  const salvar = async (novoStatus, silent) => {
    setSalvando(true);
    try {
      const body = { titulo, cliente: cliente || null, obra: obra || null, opNumero: opNumero || null, resumo: resumo || null, blocos, ...(novoStatus ? { status: novoStatus } : {}) };
      const r = await fetch(`/api/relatorios/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao salvar");
      if (novoStatus) setStatus(novoStatus);
      setDirty(false);
      if (!silent) showToast("Relatório salvo", "success");
      return true;
    } catch (e) { showToast(e.message, "error"); return false; }
    finally { setSalvando(false); }
  };

  const gerarPdf = async () => {
    const ok = await salvar();
    if (ok) window.open(`/api/relatorios/${id}/pdf`, "_blank", "noopener");
  };

  const abrirEnvio = async () => {
    setEnvOpen(true);
    setPara(clienteEmailOp || "");
    setCcEmails([]); setBuscaCc("");
    setAssunto(`Relatório de Status${obra ? " — " + obra : cliente ? " — " + cliente : ""} · Torg Metal`);
    setMensagem(`Prezados,\n\nSegue em anexo o relatório de status${obra ? " da obra " + obra : ""}.\n\nAtenciosamente,\nTorg Metal`);
    if (!torgEmails.length) {
      try { const r = await fetch("/api/relatorios/emails"); const d = await r.json(); if (r.ok) setTorgEmails(d.emails || []); } catch {}
    }
  };
  const toggleCc = (email) => setCcEmails((p) => (p.includes(email) ? p.filter((e) => e !== email) : [...p, email]));
  const addCustomCc = () => {
    const e = buscaCc.trim().toLowerCase();
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && !ccEmails.includes(e)) { setCcEmails((p) => [...p, e]); setBuscaCc(""); }
  };
  const enviar = async () => {
    const paraArr = para.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    if (!paraArr.length) { showToast("Informe o e-mail do cliente (Para)", "error"); return; }
    setEnviando(true);
    try {
      const ok = await salvar(undefined, true);
      if (!ok) throw new Error("Não foi possível salvar antes de enviar");
      const r = await fetch(`/api/relatorios/${id}/enviar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ para: paraArr, cc: ccEmails, assunto, mensagem }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao enviar");
      setStatus("EMITIDO"); setEnvOpen(false);
      showToast(`Relatório enviado ao cliente${d.cc ? ` · ${d.cc} em cópia` : ""}`, "success");
    } catch (e) { showToast(e.message, "error"); }
    finally { setEnviando(false); }
  };

  // ─── Blocos ───
  const addBloco = () => { setBlocos((p) => [...p, { id: uid(), titulo: "", descricao: "", fotos: [] }]); marcar(); };
  const rmBloco = (i) => { if (!confirm("Remover este bloco e suas fotos?")) return; setBlocos((p) => p.filter((_, idx) => idx !== i)); marcar(); };
  const moveBloco = (i, dir) => {
    setBlocos((p) => { const a = [...p]; const j = i + dir; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; }); marcar();
  };
  const setBloco = (i, campo, valor) => { setBlocos((p) => p.map((b, idx) => (idx === i ? { ...b, [campo]: valor } : b))); marcar(); };

  const addFotos = async (i, files) => {
    const lista = Array.from(files || []);
    if (!lista.length) return;
    setSubindo((n) => n + lista.length);
    for (const file of lista) {
      try {
        const reduzida = await reduzImagem(file);
        const fd = new FormData();
        fd.append("file", reduzida, "foto.jpg");
        const r = await fetch("/api/relatorios/foto", { method: "POST", body: fd });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Falha no upload");
        setBlocos((p) => p.map((b, idx) => (idx === i ? { ...b, fotos: [...(b.fotos || []), { url: d.url, legenda: "" }] } : b)));
        marcar();
      } catch (e) { showToast(e.message || "Falha ao subir foto", "error"); }
      finally { setSubindo((n) => n - 1); }
    }
  };
  const setLegenda = (i, fi, valor) => { setBlocos((p) => p.map((b, idx) => (idx === i ? { ...b, fotos: b.fotos.map((f, k) => (k === fi ? { ...f, legenda: valor } : f)) } : b))); marcar(); };
  const rmFoto = (i, fi) => { setBlocos((p) => p.map((b, idx) => (idx === i ? { ...b, fotos: b.fotos.filter((_, k) => k !== fi) } : b))); marcar(); };

  if (carregando) return <div className="py-20 text-center text-torg-gray"><Loader2 size={30} className="mx-auto animate-spin mb-2" /> Carregando...</div>;
  if (erro) return (
    <div className="py-20 text-center">
      <AlertCircle size={30} className="mx-auto text-red-400 mb-2" />
      <p className="text-sm text-red-600 mb-3">{erro}</p>
      <button onClick={carregar} className="px-3 py-1.5 text-sm bg-torg-blue text-white rounded-lg inline-flex items-center gap-2"><RefreshCw size={14} /> Tentar novamente</button>
    </div>
  );

  return (
    <div className="space-y-5 max-w-[900px]">
      {/* Barra superior */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Link href="/relatorios" className="text-sm text-torg-gray hover:text-torg-dark inline-flex items-center gap-1.5"><ArrowLeft size={16} /> Relatórios</Link>
        <div className="flex items-center gap-2">
          {dirty && <span className="text-xs text-amber-600">alterações não salvas</span>}
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${status === "EMITIDO" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>{status}</span>
          <button onClick={() => salvar(status === "EMITIDO" ? "RASCUNHO" : "EMITIDO")} disabled={salvando}
            className="px-3 py-2 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-torg-dark inline-flex items-center gap-1.5 disabled:opacity-50">
            <CheckCircle2 size={14} /> {status === "EMITIDO" ? "Voltar a rascunho" : "Marcar emitido"}
          </button>
          <button onClick={() => salvar()} disabled={salvando || subindo > 0}
            className="px-3 py-2 bg-torg-orange text-white text-xs rounded-lg hover:bg-torg-orange/90 font-medium inline-flex items-center gap-1.5 disabled:opacity-50">
            {salvando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar
          </button>
          <button onClick={gerarPdf} disabled={salvando || subindo > 0}
            className="px-3 py-2 border border-torg-blue-200 text-torg-blue text-xs rounded-lg hover:bg-torg-blue-50 font-medium inline-flex items-center gap-1.5 disabled:opacity-50">
            <FileDown size={14} /> Gerar PDF
          </button>
          <button onClick={abrirEnvio} disabled={salvando || subindo > 0}
            className="px-3 py-2 bg-torg-blue text-white text-xs rounded-lg hover:bg-torg-blue-700 font-medium inline-flex items-center gap-1.5 disabled:opacity-50">
            <Mail size={14} /> Enviar ao cliente
          </button>
        </div>
      </div>

      {/* Identificação */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-3">
        <div>
          <label className="text-xs text-torg-gray">Título do relatório</label>
          <input value={titulo} onChange={(e) => { setTitulo(e.target.value); marcar(); }}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-torg-blue font-semibold text-torg-dark" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-torg-gray">Cliente</label>
            <input value={cliente} onChange={(e) => { setCliente(e.target.value); marcar(); }} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-torg-blue" />
          </div>
          <div>
            <label className="text-xs text-torg-gray">Obra / Empreendimento</label>
            <input value={obra} onChange={(e) => { setObra(e.target.value); marcar(); }} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-torg-blue" />
          </div>
          <div>
            <label className="text-xs text-torg-gray">OP (nº)</label>
            <input value={opNumero} onChange={(e) => { setOpNumero(e.target.value); marcar(); }} placeholder="opcional" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-torg-blue" />
          </div>
        </div>
      </div>

      {/* Resumo */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <label className="text-sm font-semibold text-torg-dark">Resumo do status</label>
        <p className="text-xs text-torg-gray mb-2">Texto de abertura do relatório — visão geral do andamento.</p>
        <textarea value={resumo} onChange={(e) => { setResumo(e.target.value); marcar(); }} rows={4}
          placeholder="Ex.: Fabricação em andamento; corte e furação concluídos, montagem a 60%…"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue resize-y" />
      </div>

      {/* Blocos */}
      <div className="space-y-4">
        {blocos.map((b, i) => (
          <div key={b.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center gap-2 mb-3">
              <GripVertical size={16} className="text-gray-300" />
              <span className="text-xs font-bold text-torg-blue">Bloco {i + 1}</span>
              <div className="ml-auto flex items-center gap-1">
                <button onClick={() => moveBloco(i, -1)} disabled={i === 0} className="p-1 text-gray-400 hover:text-torg-dark disabled:opacity-30"><ChevronUp size={16} /></button>
                <button onClick={() => moveBloco(i, 1)} disabled={i === blocos.length - 1} className="p-1 text-gray-400 hover:text-torg-dark disabled:opacity-30"><ChevronDown size={16} /></button>
                <button onClick={() => rmBloco(i)} className="p-1 text-red-400 hover:text-red-600"><Trash2 size={15} /></button>
              </div>
            </div>
            <input value={b.titulo} onChange={(e) => setBloco(i, "titulo", e.target.value)} placeholder="Título do bloco (ex.: Fabricação, Montagem, Pintura)"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2 focus:ring-2 focus:ring-torg-blue font-medium" />
            <textarea value={b.descricao} onChange={(e) => setBloco(i, "descricao", e.target.value)} rows={2} placeholder="Descrição / observações deste bloco"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3 focus:ring-2 focus:ring-torg-blue resize-y" />

            {/* Fotos */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {(b.fotos || []).map((f, fi) => (
                <div key={fi} className="border border-gray-100 rounded-lg overflow-hidden bg-gray-50">
                  <div className="relative aspect-video bg-gray-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.url} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => rmFoto(i, fi)} className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-1 hover:bg-black/70"><X size={13} /></button>
                  </div>
                  <input value={f.legenda || ""} onChange={(e) => setLegenda(i, fi, e.target.value)} placeholder="Legenda"
                    className="w-full border-0 border-t border-gray-100 px-2 py-1.5 text-xs focus:ring-1 focus:ring-torg-blue" />
                </div>
              ))}
              <button onClick={() => fileRefs.current[b.id]?.click()}
                className="aspect-video border-2 border-dashed border-gray-200 rounded-lg flex flex-col items-center justify-center text-torg-gray hover:border-torg-blue hover:text-torg-blue transition-colors">
                <ImagePlus size={22} />
                <span className="text-[11px] mt-1">Adicionar foto</span>
              </button>
              <input ref={(el) => (fileRefs.current[b.id] = el)} type="file" accept="image/*" multiple className="hidden"
                onChange={(e) => { addFotos(i, e.target.files); e.target.value = ""; }} />
            </div>
          </div>
        ))}

        <button onClick={addBloco} className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-torg-gray hover:border-torg-blue hover:text-torg-blue font-medium inline-flex items-center justify-center gap-2 transition-colors">
          <Plus size={18} /> Adicionar bloco
        </button>
      </div>

      {subindo > 0 && (
        <div className="fixed bottom-4 right-4 bg-torg-dark text-white text-sm rounded-lg px-4 py-2 shadow-lg inline-flex items-center gap-2">
          <Loader2 size={15} className="animate-spin" /> Enviando {subindo} foto{subindo === 1 ? "" : "s"}…
        </div>
      )}

      {envOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !enviando && setEnvOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-torg-dark flex items-center gap-2"><Mail size={18} className="text-torg-blue" /> Enviar ao cliente</h3>
              <button onClick={() => setEnvOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>

            <label className="text-xs text-torg-gray">Para (cliente)</label>
            <input value={para} onChange={(e) => setPara(e.target.value)} placeholder="email@cliente.com (vírgula separa vários)"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-torg-blue" />
            {!clienteEmailOp && <p className="text-[11px] text-amber-600 mt-1">A OP não tem e-mail do cliente cadastrado — digite acima.</p>}

            <label className="text-xs text-torg-gray flex items-center gap-1 mt-3"><Users size={13} /> Em cópia (equipe Torg)</label>
            {ccEmails.length > 0 && (
              <div className="flex flex-wrap gap-1.5 my-1.5">
                {ccEmails.map((e) => (
                  <span key={e} className="inline-flex items-center gap-1 bg-torg-blue-50 text-torg-blue text-xs rounded-full px-2 py-0.5">
                    {e} <button onClick={() => toggleCc(e)} className="hover:text-red-500"><X size={12} /></button>
                  </span>
                ))}
              </div>
            )}
            <input value={buscaCc} onChange={(e) => setBuscaCc(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomCc(); } }}
              placeholder="Buscar na equipe, ou digitar um e-mail + Enter…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-torg-blue" />
            <div className="border border-gray-100 rounded-lg mt-1 max-h-40 overflow-y-auto divide-y divide-gray-50">
              {torgEmails.length === 0 ? (
                <div className="px-3 py-2 text-xs text-torg-gray">Carregando e-mails da equipe…</div>
              ) : (
                torgEmails
                  .filter((u) => { const q = buscaCc.trim().toLowerCase(); return !q || (`${u.nome} ${u.email}`).toLowerCase().includes(q); })
                  .slice(0, 80)
                  .map((u) => {
                    const sel = ccEmails.includes(u.email);
                    return (
                      <button key={u.email} onClick={() => toggleCc(u.email)}
                        className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-gray-50 ${sel ? "bg-torg-blue-50/50" : ""}`}>
                        <span><span className="font-medium text-torg-dark">{u.nome}</span> <span className="text-torg-gray">· {u.email}</span></span>
                        {sel && <Check size={14} className="text-torg-blue shrink-0" />}
                      </button>
                    );
                  })
              )}
            </div>

            <label className="text-xs text-torg-gray mt-3 block">Assunto</label>
            <input value={assunto} onChange={(e) => setAssunto(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-torg-blue" />

            <label className="text-xs text-torg-gray mt-3 block">Mensagem</label>
            <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={5} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-torg-blue resize-y" />

            <p className="text-[11px] text-torg-gray mt-2 inline-flex items-center gap-1"><FileDown size={12} /> O PDF do relatório vai anexado automaticamente.</p>

            <div className="flex items-center justify-end gap-2 mt-4">
              <button onClick={() => setEnvOpen(false)} className="px-4 py-2 text-sm text-torg-gray hover:text-torg-dark">Cancelar</button>
              <button onClick={enviar} disabled={enviando || !para.trim()}
                className="px-4 py-2 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-blue-700 font-medium inline-flex items-center gap-2 disabled:opacity-50">
                {enviando ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Enviar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
