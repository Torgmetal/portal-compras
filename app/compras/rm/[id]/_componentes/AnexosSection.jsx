"use client";
import { useState, useRef } from "react";
import { upload as blobUpload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle, X, FileText, Upload } from "lucide-react";

// Secao de anexos (desenhos, especificacoes) na pagina da RM.
// Permite upload de novos arquivos e remocao dos existentes.
// Os arquivos sao enviados aos fornecedores junto com a cotacao.
export function AnexosSection({ rmId, anexos: anexosIniciais, editavel }) {
  useRouter();
  const [anexos, setAnexos] = useState(anexosIniciais || []);
  const [uploading, setUploading] = useState(0);
  const [erro, setErro] = useState("");
  const fileRef = useRef(null);

  const fmtBytes = (n) => {
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / (1024 * 1024)).toFixed(1) + " MB";
  };

  const upload = async (files) => {
    if (!files || files.length === 0) return;
    setErro("");
    for (const file of files) {
      setUploading((n) => n + 1);
      try {
        const safe = String(file.name || "arquivo").replace(/[^\w\d.\- ]/g, "_").slice(0, 100);
        const blob = await blobUpload(`rm-anexos/${Date.now()}-${safe}`, file, {
          access: "public",
          handleUploadUrl: "/api/rm/upload-token",
        });
        const upData = { url: blob.url, nomeArquivo: file.name, tamanho: file.size, tipo: file.type || "application/octet-stream" };

        const linkRes = await fetch(`/api/rm/${rmId}/anexos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(upData),
        });
        const linkData = await linkRes.json();
        if (!linkRes.ok) throw new Error(linkData.error || "Falha ao vincular");
        setAnexos((p) => [...p, linkData]);
      } catch (e) {
        setErro(`Falha ao enviar "${file.name}": ${e.message}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const remover = async (anexo) => {
    if (!window.confirm(`Remover "${anexo.nomeArquivo}"?`)) return;
    setErro("");
    try {
      const res = await fetch(`/api/rm/${rmId}/anexos/${anexo.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao remover");
      setAnexos((p) => p.filter((a) => a.id !== anexo.id));
    } catch (e) {
      setErro(e.message);
    }
  };

  if (anexos.length === 0 && !editavel) return null;

  return (
    <div className="mt-4 pt-4 border-t border-gray-100">
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-torg-dark inline-flex items-center gap-1.5">
            <FileText size={14} className="text-torg-blue" /> Anexos
            <span className="text-xs text-torg-gray font-normal">({anexos.length})</span>
          </p>
          <p className="text-[11px] text-torg-gray mt-0.5">
            Desenhos, especificações e referências. Visíveis pros fornecedores quando enviar cotação.
          </p>
        </div>
        {editavel && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading > 0}
            className="px-3 py-1.5 bg-white border border-torg-blue-200 text-torg-blue text-xs rounded-lg hover:bg-torg-blue-50 font-medium flex items-center gap-1.5 disabled:opacity-50"
          >
            {uploading > 0 ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
            {uploading > 0 ? `Enviando ${uploading}...` : "Anexar"}
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="application/pdf,image/*,.dwg,.dxf,.zip,.docx,.xlsx,.txt"
          className="hidden"
          onChange={(e) => { upload(Array.from(e.target.files || [])); e.target.value = ""; }}
        />
      </div>
      {erro && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded px-3 py-1.5 mb-2 flex items-start gap-2">
          <AlertCircle size={12} className="mt-0.5 flex-shrink-0" /> <span>{erro}</span>
        </div>
      )}
      {anexos.length > 0 ? (
        <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
          {anexos.map((a) => (
            <li key={a.id} className="px-3 py-2 flex items-center gap-3 hover:bg-gray-50">
              <FileText size={14} className="text-torg-blue flex-shrink-0" />
              <a
                href={a.blobUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 min-w-0 truncate text-sm text-torg-dark hover:text-torg-blue hover:underline"
                title={a.nomeArquivo}
              >
                {a.nomeArquivo}
              </a>
              <span className="text-xs text-torg-gray tabular-nums whitespace-nowrap">{fmtBytes(a.tamanho || 0)}</span>
              {editavel && (
                <button
                  type="button"
                  onClick={() => remover(a)}
                  className="text-red-500 hover:text-red-700"
                  title="Remover anexo"
                >
                  <X size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-torg-gray italic">Nenhum anexo. Clique em "Anexar" pra adicionar desenhos/PDFs.</p>
      )}
    </div>
  );
}
