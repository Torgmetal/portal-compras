"use client";
import { useState, useEffect, useRef } from "react";
import { upload as blobUpload } from "@vercel/blob/client";
import { FileText, Plus, Loader2, Sparkles, Send, Trash2, CheckCircle2, Clock, Paperclip, X } from "lucide-react";
import ModalEnviarAta from "@/components/comercial/ModalEnviarAta";

const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");
const fmtDT = (d) => (d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
const STATUS = { RASCUNHO: { l: "Rascunho", c: "bg-gray-100 text-gray-600" }, ENVIADA: { l: "Enviada", c: "bg-blue-100 text-blue-700" }, ACEITA: { l: "Aceita", c: "bg-emerald-100 text-emerald-700" } };
const nn = (n) => String(n).padStart(2, "0");

export default function AtasOPSection({ opId }) {
  const [atas, setAtas] = useState(null);
  const [erro, setErro] = useState("");
  const [selId, setSelId] = useState(null);
  const [criando, setCriando] = useState(false);

  const carregar = () => fetch(`/api/comercial/op/${opId}/atas`).then((r) => r.json())
    .then((j) => { if (j.success) setAtas(j.atas); else setErro(j.error || "Erro"); }).catch(() => setErro("Erro ao carregar"));
  useEffect(() => { carregar(); }, [opId]);

  async function novaAta() {
    setCriando(true);
    try {
      const r = await fetch(`/api/comercial/op/${opId}/atas`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const j = await r.json(); if (!j.success) throw new Error(j.error);
      await carregar(); setSelId(j.ata.id);
    } catch (e) { alert(e.message); } finally { setCriando(false); }
  }

  if (atas === null && !erro) return <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 text-center text-torg-gray"><Loader2 size={22} className="mx-auto animate-spin" /></div>;
  const sel = (atas || []).find((a) => a.id === selId);

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <h3 className="text-sm font-bold text-torg-dark inline-flex items-center gap-1.5"><FileText size={15} className="text-torg-blue" /> Atas de reunião <span className="text-torg-gray font-normal">· da OP</span></h3>
        <button onClick={novaAta} disabled={criando} className="text-xs bg-torg-blue text-white rounded-lg px-2.5 py-1 inline-flex items-center gap-1 font-medium hover:bg-torg-dark disabled:opacity-50">{criando ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Nova ata</button>
      </div>
      {erro && <p className="text-xs text-red-600 mb-2">{erro}</p>}
      {(atas || []).length === 0 ? (
        <p className="text-sm text-torg-gray py-6 text-center">Nenhuma ata ainda — crie a primeira reunião desta OP. A IA organiza o texto e você envia ao cliente para aceite.</p>
      ) : (
        <div className="flex gap-4 flex-col sm:flex-row">
          <div className="sm:w-52 shrink-0 space-y-1">
            {(atas || []).map((a) => (
              <button key={a.id} onClick={() => setSelId(a.id)} className={`w-full text-left px-2.5 py-1.5 rounded-lg border ${selId === a.id ? "border-torg-blue bg-torg-blue-50/50" : "border-gray-100 hover:bg-gray-50"}`}>
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[12px] font-semibold text-torg-dark">ATA #{nn(a.numero)}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${STATUS[a.status]?.c}`}>{STATUS[a.status]?.l}</span>
                </div>
                <p className="text-[11px] text-torg-gray truncate">{a.titulo}</p>
              </button>
            ))}
          </div>
          <div className="flex-1 min-w-0">
            {sel ? <AtaEditor key={sel.id} opId={opId} ata={sel} onChange={carregar} onDelete={() => { setSelId(null); carregar(); }} /> : <p className="text-sm text-torg-gray py-6 text-center">Selecione uma ata na lista.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function AtaEditor({ opId, ata, onChange, onDelete }) {
  const [f, setF] = useState({ titulo: ata.titulo || "", dataReuniao: ata.dataReuniao ? String(ata.dataReuniao).slice(0, 10) : "", participantes: ata.participantes || "", pauta: ata.pauta || "" });
  const [cj, setCj] = useState(ata.conteudoJson || null);
  const [salvando, setSalvando] = useState(false);
  const [iaLoad, setIaLoad] = useState(false);
  const [enviarOpen, setEnviarOpen] = useState(false);
  const [anexos, setAnexos] = useState(Array.isArray(ata.anexos) ? ata.anexos : []);
  const [subindo, setSubindo] = useState(false);
  const fileRef = useRef(null);
  const trav = ata.status === "ACEITA";
  const inp = "w-full text-[13px] border border-gray-200 rounded-lg px-2.5 py-1.5 focus:border-torg-blue outline-none disabled:bg-gray-50";

  async function salvar() {
    setSalvando(true);
    try {
      const r = await fetch(`/api/comercial/op/${opId}/atas/${ata.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, dataReuniao: f.dataReuniao || null }) });
      const j = await r.json(); if (!j.success) throw new Error(j.error);
      onChange();
    } catch (e) { alert(e.message); } finally { setSalvando(false); }
  }
  async function organizarIA() {
    if (!f.pauta.trim()) { alert("Cole o texto da reunião primeiro."); return; }
    setIaLoad(true);
    try {
      const r = await fetch(`/api/comercial/op/${opId}/atas/${ata.id}/ia`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto: f.pauta }) });
      const j = await r.json(); if (!j.success) throw new Error(j.error);
      setCj(j.ata.conteudoJson);
      setF((v) => ({ ...v, titulo: j.ata.titulo || v.titulo, participantes: j.ata.participantes || v.participantes }));
      onChange();
    } catch (e) { alert(e.message); } finally { setIaLoad(false); }
  }
  async function excluir() {
    if (!confirm(`Excluir a ATA #${nn(ata.numero)}? Não pode ser desfeito.`)) return;
    const r = await fetch(`/api/comercial/op/${opId}/atas/${ata.id}`, { method: "DELETE" });
    const j = await r.json(); if (j.success) onDelete(); else alert(j.error);
  }
  async function salvarAnexos(novos) {
    setAnexos(novos);
    try {
      const r = await fetch(`/api/comercial/op/${opId}/atas/${ata.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ anexos: novos }) });
      const j = await r.json(); if (!j.success) throw new Error(j.error);
      onChange();
    } catch (e) { alert(e.message); }
  }
  async function anexar(files) {
    if (!files?.length) return;
    setSubindo(true);
    try {
      let seq = anexos.reduce((m, a) => Math.max(m, a.seq || 0), 0);
      const novos = [...anexos];
      for (const file of files) {
        const safe = String(file.name || "arquivo").replace(/[^\w\d.\- ]/g, "_").slice(0, 100);
        const blob = await blobUpload(`atas-op/${Date.now()}-${safe}`, file, { access: "public", handleUploadUrl: `/api/comercial/op/${opId}/atas/upload-token` });
        novos.push({ seq: ++seq, nome: file.name, url: blob.url, tamanho: file.size });
      }
      await salvarAnexos(novos);
    } catch (e) { alert(`Falha ao anexar: ${e.message}`); } finally { setSubindo(false); }
  }
  function removerAnexo(seq) {
    if (!confirm("Remover este anexo?")) return;
    salvarAnexos(anexos.filter((a) => a.seq !== seq));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[13px] font-bold text-torg-dark">ATA #{nn(ata.numero)} <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${STATUS[ata.status]?.c}`}>{STATUS[ata.status]?.l}</span></span>
        <button onClick={excluir} className="text-torg-gray hover:text-red-600" title="Excluir"><Trash2 size={14} /></button>
      </div>
      {trav && <div className="text-[12px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-1.5 inline-flex items-center gap-1.5"><CheckCircle2 size={14} /> Aceita pelo cliente ({ata.aceiteNome}) em {fmtDT(ata.aceiteEm)} — travada.</div>}

      <input value={f.titulo} onChange={(e) => setF((v) => ({ ...v, titulo: e.target.value }))} placeholder="Título da reunião" className={inp} disabled={trav} />
      <div className="flex gap-2 flex-wrap">
        <input type="date" value={f.dataReuniao} onChange={(e) => setF((v) => ({ ...v, dataReuniao: e.target.value }))} className={`${inp} w-40`} disabled={trav} />
        <input value={f.participantes} onChange={(e) => setF((v) => ({ ...v, participantes: e.target.value }))} placeholder="Participantes" className={`${inp} flex-1 min-w-[160px]`} disabled={trav} />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] text-torg-gray">Texto / transcrição da reunião</span>
          {!trav && <button onClick={organizarIA} disabled={iaLoad} className="text-[11px] text-white bg-[#F4801F] rounded-lg px-2 py-1 inline-flex items-center gap-1 font-medium disabled:opacity-50">{iaLoad ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />} Organizar com IA</button>}
        </div>
        <textarea value={f.pauta} onChange={(e) => setF((v) => ({ ...v, pauta: e.target.value }))} rows={4} placeholder="Cole o que foi tratado na reunião — a IA organiza em resumo, tópicos e ações." className={inp} disabled={trav} />
      </div>

      {cj && (cj.resumo || cj.topicos?.length || cj.acoes?.length) && (
        <div className="border border-gray-100 rounded-lg p-3 bg-gray-50/40 text-[12px] space-y-2">
          {cj.resumo && <p className="text-torg-dark"><b>Resumo:</b> {cj.resumo}</p>}
          {cj.topicos?.length > 0 && <div><b className="text-torg-dark">Tópicos</b><ul className="list-disc ml-4 mt-0.5 text-torg-gray space-y-0.5">{cj.topicos.map((t, i) => <li key={i}><b className="text-torg-dark">{t.titulo}</b>{t.discussao ? ` — ${t.discussao}` : ""}</li>)}</ul></div>}
          {cj.acoes?.length > 0 && <div><b className="text-torg-dark">Ações</b><ul className="list-disc ml-4 mt-0.5 text-torg-gray space-y-0.5">{cj.acoes.map((a, i) => <li key={i}>{a.descricao}{a.responsavel ? ` · ${a.responsavel}` : ""}{a.prazo ? ` · prazo ${fmtD(a.prazo)}` : ""}</li>)}</ul></div>}
        </div>
      )}

      {/* Anexos (PDF/Word/Excel) — cada um com nº de sequência */}
      {(anexos.length > 0 || !trav) && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-torg-gray">Anexos{anexos.length > 0 ? ` (${anexos.length})` : ""}</span>
            {!trav && (<>
              <input ref={fileRef} type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.eml,.msg,message/rfc822,application/vnd.ms-outlook,image/*,application/pdf" className="hidden" onChange={(e) => { anexar(Array.from(e.target.files || [])); e.target.value = ""; }} />
              <button onClick={() => fileRef.current?.click()} disabled={subindo} className="text-[11px] text-torg-blue border border-torg-blue-200 rounded-lg px-2 py-1 inline-flex items-center gap-1 font-medium hover:bg-torg-blue-50 disabled:opacity-50">{subindo ? <Loader2 size={11} className="animate-spin" /> : <Paperclip size={11} />} Anexar PDF, Word, Excel, e-mail…</button>
            </>)}
          </div>
          {anexos.length > 0 && (
            <ul className="border border-gray-100 rounded-lg divide-y divide-gray-50">
              {anexos.map((a) => (
                <li key={a.seq} className="px-2.5 py-1.5 flex items-center gap-2 text-[12px]">
                  <span className="text-[10px] font-mono font-semibold text-torg-blue shrink-0">#{nn(a.seq)}</span>
                  <a href={a.url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 truncate text-torg-dark hover:text-torg-blue hover:underline" title={a.nome}>{a.nome}</a>
                  {!trav && <button onClick={() => removerAnexo(a.seq)} className="text-torg-gray hover:text-red-600 shrink-0"><X size={13} /></button>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!trav && (
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={salvar} disabled={salvando} className="text-[13px] bg-torg-blue text-white rounded-lg px-3.5 py-1.5 font-medium hover:bg-torg-dark disabled:opacity-50 inline-flex items-center gap-1.5">{salvando && <Loader2 size={13} className="animate-spin" />} Salvar</button>
          <button onClick={() => setEnviarOpen(true)} className="text-[13px] border border-torg-blue text-torg-blue rounded-lg px-3 py-1.5 font-medium hover:bg-torg-blue-50 inline-flex items-center gap-1.5"><Send size={13} /> {ata.status === "ENVIADA" ? "Reenviar ata" : "Enviar ao cliente / Torg"}</button>
          {ata.status === "ENVIADA" && !ata.aceiteEm && <span className="text-[11px] text-blue-600 inline-flex items-center gap-1"><Clock size={12} /> aguardando aceite</span>}
        </div>
      )}
      {enviarOpen && <ModalEnviarAta opId={opId} ataId={ata.id} onClose={() => setEnviarOpen(false)} onEnviado={() => onChange()} />}
    </div>
  );
}
