"use client";
import { useState, useEffect, useRef } from "react";
import { upload as blobUpload } from "@vercel/blob/client";
import { FileText, PenTool, Upload, FolderDown, Eye, Download, Trash2, ChevronUp, ChevronDown, Loader2, X, ExternalLink, AlertCircle, CheckCircle2 } from "lucide-react";

const fmtTam = (n) => (n == null ? "" : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const iconFor = (ext) => (ext === "pdf" ? { I: FileText, c: "text-red-500" } : ext === "dwg" || ext === "dxf" ? { I: PenTool, c: "text-torg-blue" } : { I: FileText, c: "text-torg-gray" });

export default function DesenhosOPSection({ opId }) {
  const [desenhos, setDesenhos] = useState(null);
  const [erro, setErro] = useState("");
  const [subindo, setSubindo] = useState(false);
  const [pastaOpen, setPastaOpen] = useState(false);
  const fileRef = useRef(null);

  const carregar = () => fetch(`/api/comercial/op/${opId}/desenhos`).then((r) => r.json())
    .then((j) => { if (j.success) setDesenhos(j.desenhos); else setErro(j.error || "Erro"); }).catch(() => setErro("Erro ao carregar"));
  useEffect(() => { carregar(); }, [opId]);

  async function enviar(files) {
    if (!files?.length) return;
    setSubindo(true); setErro("");
    try {
      for (const file of files) {
        const safe = String(file.name || "desenho").replace(/[^\w\d.\- ]/g, "_").slice(0, 120);
        const blob = await blobUpload(`desenhos-op/${opId}/${Date.now()}-${safe}`, file, { access: "public", handleUploadUrl: `/api/comercial/op/${opId}/desenhos/upload-token` });
        const r = await fetch(`/api/comercial/op/${opId}/desenhos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: file.name, url: blob.url, tamanho: file.size }) });
        const j = await r.json(); if (!j.success) throw new Error(j.error);
      }
      carregar();
    } catch (e) { setErro(`Falha ao enviar: ${e.message}`); } finally { setSubindo(false); }
  }
  async function excluir(d) {
    if (!confirm(`Remover "${d.nome}" da lista? ${d.origem === "SHAREPOINT" ? "(o arquivo continua na pasta da obra)" : "(apaga o arquivo enviado)"}`)) return;
    const r = await fetch(`/api/comercial/op/${opId}/desenhos/${d.id}`, { method: "DELETE" });
    const j = await r.json(); if (j.success) carregar(); else alert(j.error);
  }
  async function mover(idx, dir) {
    const j = idx + dir; if (j < 0 || j >= desenhos.length) return;
    const novo = [...desenhos]; [novo[idx], novo[j]] = [novo[j], novo[idx]];
    setDesenhos(novo);
    await fetch(`/api/comercial/op/${opId}/desenhos/reordenar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ordem: novo.map((d) => d.id) }) }).catch(() => {});
    carregar();
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <h3 className="text-lg font-semibold text-torg-dark flex items-center gap-2"><PenTool size={18} className="text-torg-blue" /> Projetos e desenhos</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setPastaOpen(true)} className="text-xs border border-torg-blue text-torg-blue rounded-lg px-2.5 py-1.5 font-medium inline-flex items-center gap-1 hover:bg-torg-blue-50"><FolderDown size={13} /> Trazer da pasta da obra</button>
          <input ref={fileRef} type="file" multiple accept=".pdf,.dwg,.dxf,application/pdf,application/acad,image/vnd.dwg,application/octet-stream" className="hidden" onChange={(e) => { enviar(Array.from(e.target.files || [])); e.target.value = ""; }} />
          <button onClick={() => fileRef.current?.click()} disabled={subindo} className="text-xs bg-torg-blue text-white rounded-lg px-2.5 py-1.5 font-medium inline-flex items-center gap-1 hover:bg-torg-dark disabled:opacity-50">{subindo ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Importar DWG/PDF</button>
        </div>
      </div>
      <p className="text-sm text-torg-gray mb-4">Desenhos de projeto da OP. Envie DWG/PDF ou puxe os PDFs as-built da pasta da obra. PDFs abrem para visualização; DWG baixa (precisa de um leitor de CAD).</p>
      {erro && <p className="text-xs text-red-600 mb-2 inline-flex items-center gap-1"><AlertCircle size={13} /> {erro}</p>}

      {desenhos === null ? (
        <div className="py-8 text-center text-torg-gray"><Loader2 size={22} className="mx-auto animate-spin" /></div>
      ) : desenhos.length === 0 ? (
        <div className="border border-dashed border-gray-200 rounded-lg py-8 text-center">
          <PenTool size={26} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm font-semibold text-torg-dark">Nenhum desenho ainda</p>
          <p className="text-xs text-torg-gray mt-1 max-w-md mx-auto">Importe os arquivos DWG/PDF ou use <strong>Trazer da pasta da obra</strong> para puxar os PDFs de projeto já salvos no servidor.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {desenhos.map((d, i) => {
            const { I, c } = iconFor(d.ext);
            const isPdf = d.ext === "pdf";
            const arq = `/api/comercial/op/${opId}/desenhos/${d.id}/arquivo`;
            return (
              <div key={d.id} className="flex items-center gap-2.5 border border-gray-100 rounded-lg px-2.5 py-2 hover:bg-gray-50/60">
                <div className="flex flex-col">
                  <button onClick={() => mover(i, -1)} disabled={i === 0} className="text-gray-300 hover:text-torg-blue disabled:opacity-30 leading-none"><ChevronUp size={13} /></button>
                  <button onClick={() => mover(i, 1)} disabled={i === desenhos.length - 1} className="text-gray-300 hover:text-torg-blue disabled:opacity-30 leading-none"><ChevronDown size={13} /></button>
                </div>
                <I size={18} className={`${c} shrink-0`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-torg-dark truncate" title={d.nome}>{d.nome}</p>
                  <div className="flex items-center gap-1.5 text-[11px] text-torg-gray flex-wrap">
                    {d.ext && <span className="uppercase font-mono">{d.ext}</span>}
                    {d.origem === "SHAREPOINT"
                      ? <span className="px-1.5 py-0.5 rounded-full bg-torg-blue-50 text-torg-blue font-medium">pasta da obra{d.area ? ` · ${d.area}` : ""}</span>
                      : <span className="px-1.5 py-0.5 rounded-full bg-gray-100">enviado{d.tamanho ? ` · ${fmtTam(d.tamanho)}` : ""}</span>}
                  </div>
                </div>
                <a href={arq} target="_blank" rel="noopener noreferrer" className="text-xs text-torg-blue border border-torg-blue-200 rounded-lg px-2 py-1 inline-flex items-center gap-1 font-medium hover:bg-torg-blue-50 whitespace-nowrap">{isPdf ? <><Eye size={12} /> Visualizar</> : <><Download size={12} /> Baixar</>}</a>
                {d.origem === "SHAREPOINT" && d.webUrl && <a href={d.webUrl} target="_blank" rel="noopener noreferrer" className="text-torg-gray hover:text-torg-blue" title="Abrir no SharePoint"><ExternalLink size={14} /></a>}
                <button onClick={() => excluir(d)} className="text-torg-gray hover:text-red-600" title="Remover"><Trash2 size={14} /></button>
              </div>
            );
          })}
        </div>
      )}

      {pastaOpen && <PastaModal opId={opId} onClose={() => setPastaOpen(false)} onImportado={() => { setPastaOpen(false); carregar(); }} />}
    </div>
  );
}

function PastaModal({ opId, onClose, onImportado }) {
  const [dados, setDados] = useState(null);
  const [sel, setSel] = useState({});
  const [carregando, setCarregando] = useState(true);
  const [importando, setImportando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    fetch(`/api/comercial/op/${opId}/desenhos/pasta`).then((r) => r.json())
      .then((j) => {
        if (!j.success) { setErro(j.error || "Erro"); return; }
        setDados(j);
        const pre = {}; for (const d of j.desenhos || []) if (!d.jaImportado) pre[d.itemId] = true; setSel(pre);
      })
      .catch(() => setErro("Não foi possível ler a pasta da obra.")).finally(() => setCarregando(false));
  }, [opId]);

  const lista = dados?.desenhos || [];
  const marcados = lista.filter((d) => sel[d.itemId] && !d.jaImportado);
  const toggle = (id) => setSel((s) => ({ ...s, [id]: !s[id] }));

  async function importar() {
    if (!marcados.length) return;
    setImportando(true); setErro("");
    try {
      const r = await fetch(`/api/comercial/op/${opId}/desenhos/pasta`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ desenhos: marcados }) });
      const j = await r.json(); if (!j.success) throw new Error(j.error);
      onImportado();
    } catch (e) { setErro(e.message); setImportando(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-xl my-8">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-torg-dark inline-flex items-center gap-2"><FolderDown size={15} className="text-torg-blue" /> Desenhos da pasta da obra</h3>
            {dados?.opFolder && <p className="text-[11px] text-torg-gray mt-0.5 truncate">{dados.opFolder} · Engenharia / Projetos</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-5 py-4">
          {carregando ? (
            <div className="py-10 text-center text-torg-gray text-sm"><Loader2 size={22} className="mx-auto animate-spin mb-2" /> Lendo a pasta da obra no servidor…</div>
          ) : erro && !lista.length ? (
            <p className="py-8 text-center text-sm text-red-600">{erro}</p>
          ) : !lista.length ? (
            <p className="py-8 text-center text-sm text-torg-gray">{dados?.erro || "Nenhum PDF de projeto (Montagem/Conjunto) encontrado na pasta da obra."}</p>
          ) : (
            <div className="border border-gray-100 rounded-lg divide-y divide-gray-50 max-h-80 overflow-y-auto">
              {lista.map((d) => (
                <label key={d.itemId} className={`flex items-center gap-2.5 px-3 py-2 text-[13px] ${d.jaImportado ? "opacity-60" : "cursor-pointer hover:bg-gray-50"}`}>
                  <input type="checkbox" disabled={d.jaImportado} checked={d.jaImportado || !!sel[d.itemId]} onChange={() => toggle(d.itemId)} className="accent-torg-blue" />
                  <FileText size={15} className="text-red-500 shrink-0" />
                  <span className="flex-1 min-w-0 truncate text-torg-dark" title={d.nome}>{d.nome}</span>
                  {d.area && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-torg-blue-50 text-torg-blue">{d.area}</span>}
                  {d.jaImportado && <span className="text-[10px] text-emerald-700 inline-flex items-center gap-0.5"><CheckCircle2 size={11} /> importado</span>}
                </label>
              ))}
            </div>
          )}
          {erro && lista.length > 0 && <p className="text-xs text-red-600 mt-2 inline-flex items-center gap-1"><AlertCircle size={13} /> {erro}</p>}
        </div>
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-2 rounded-b-xl">
          <span className="text-[11px] text-torg-gray">{marcados.length} selecionado{marcados.length === 1 ? "" : "s"}</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-sm text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100">Cancelar</button>
            <button onClick={importar} disabled={importando || !marcados.length} className="px-4 py-1.5 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-dark font-medium inline-flex items-center gap-1.5 disabled:opacity-50">{importando ? <Loader2 size={14} className="animate-spin" /> : <FolderDown size={14} />} Trazer {marcados.length || ""}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
