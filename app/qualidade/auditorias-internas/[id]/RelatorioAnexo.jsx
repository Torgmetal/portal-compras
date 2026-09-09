"use client";
import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { ExternalLink, FileText, Loader2, Paperclip } from "lucide-react";
import { useStore } from "@/lib/store";
import { TIPOS_RELATORIO, validarArquivoRelatorio } from "@/lib/auditoria-relatorio-anexo";

export default function RelatorioAnexo({ auditoriaId, anexo, onSalvo, bloqueado }) {
  const input = useRef(null);
  const { showToast } = useStore();
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [erro, setErro] = useState("");
  const [pendente, setPendente] = useState(null);

  async function anexar(file) {
    if (!file) return;
    setEnviando(true); setErro(""); setProgresso(0);
    try {
      const tipo = validarArquivoRelatorio(file.name, file.size);
      setPendente(file);
      const nomeSeguro = file.name.replace(/[^\w.-]/g, "_").slice(-120);
      const blob = await upload(`qualidade/auditorias/${auditoriaId}/${nomeSeguro}`, file, {
        access: "public", contentType: tipo, handleUploadUrl: "/api/qualidade/documentos/upload-token",
        onUploadProgress: ({ percentage }) => setProgresso(Math.round(percentage)),
      });
      const r = await fetch(`/api/qualidade/auditorias-internas/${auditoriaId}/relatorio`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: blob.url, nome: file.name }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Falha ao salvar o anexo.");
      onSalvo(j);
      setPendente(null);
      showToast("Relatório anexado e salvo.", "success");
    } catch (e) { setErro(e.message || "Falha ao anexar relatório."); }
    finally { setEnviando(false); if (input.current) input.current.value = ""; }
  }

  return <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3" aria-label="Relatório anexado">
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <h2 className="font-semibold text-torg-dark">Relatório anexado</h2>
      <button type="button" disabled={enviando || bloqueado} onClick={() => input.current?.click()} className="px-3 py-2 bg-torg-blue text-white rounded-lg text-sm inline-flex items-center gap-2 disabled:opacity-50">
        {enviando ? <Loader2 size={15} className="animate-spin" /> : <Paperclip size={15} />}
        {enviando ? `Enviando ${progresso}%…` : anexo ? "Substituir relatório" : "Anexar relatório"}
      </button>
      <input ref={input} type="file" aria-label="Selecionar relatório" className="hidden" accept={Object.keys(TIPOS_RELATORIO).map((ext) => `.${ext}`).join(",")} onChange={(e) => anexar(e.target.files?.[0])} />
    </div>
    <p className="text-xs text-torg-gray">PDF, Word, Excel, JPG ou PNG · até 50 MB. O anexo é salvo automaticamente.</p>
    {anexo ? <div className="flex items-center justify-between gap-3 flex-wrap rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="flex items-center gap-2 min-w-0"><FileText size={18} className="text-torg-blue shrink-0" /><span className="text-sm text-torg-dark break-all">{anexo.nome}</span></div>
      <a href={anexo.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-torg-blue underline"><ExternalLink size={14} /> Ver relatório</a>
    </div> : <div className="text-sm text-torg-gray border border-dashed border-gray-200 rounded-lg p-4 flex items-center gap-2"><FileText size={16} /> Nenhum relatório anexado.</div>}
    {erro && <div role="alert" className="text-sm text-red-700 flex items-center gap-3 flex-wrap">{erro}<button type="button" disabled={enviando || bloqueado} onClick={() => pendente ? anexar(pendente) : input.current?.click()} className="underline disabled:opacity-50">Tentar novamente</button></div>}
  </section>;
}
