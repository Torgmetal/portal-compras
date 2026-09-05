"use client";
import { useState, useEffect, useRef } from "react";
import { upload as blobUpload } from "@vercel/blob/client";
import { Loader2, X } from "lucide-react";

// ─── EVIDÊNCIA DO RECEBIMENTO ──────────────────────────────────────────────────
//
// ⚠⚠ O ARQUIVO NÃO PASSA PELA FUNÇÃO. Foto de celular sai com 8 a 12 MB e a rota serverless corta
// em ~4,5 MB — o "não anexa" quase sempre é TAMANHO. Sobe direto para o Blob com token
// (/api/rm/upload-token) e só o vínculo vai para a nossa rota. Ver torg_upload_4mb.
export function EvidenciaRecebimento({ pedidoId }) {
  const [fotos, setFotos] = useState(null);
  const [subindo, setSubindo] = useState(0);
  const [erro, setErro] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/compras/recebimento-evidencia?pedidoId=${encodeURIComponent(pedidoId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => vivo && setFotos(j?.fotos || []))
      .catch(() => vivo && setFotos([]));
    return () => { vivo = false; };
  }, [pedidoId]);

  async function enviar(lista) {
    const arquivos = [...(lista || [])].filter((f) => /^image\//i.test(f.type));
    if (!arquivos.length) { setErro("Só imagens aqui — a nota em PDF vai no CMR."); return; }
    setErro(""); setSubindo(arquivos.length);
    for (const f of arquivos) {
      try {
        const blob = await blobUpload(`recebimento/${pedidoId}/${Date.now()}-${f.name}`, f, {
          access: "public", handleUploadUrl: "/api/rm/upload-token",
        });
        const r = await fetch("/api/compras/recebimento-evidencia", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pedidoId, arquivoUrl: blob.url, nome: f.name, arquivoTipo: f.type, arquivoTamanho: f.size }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "não consegui anexar");
        setFotos((p) => [...(p || []), j.foto]);
      } catch (e) { setErro(e.message); }
      finally { setSubindo((n) => n - 1); }
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  async function remover(id) {
    if (!confirm("Tirar esta foto da evidência?")) return;
    try {
      const r = await fetch(`/api/compras/recebimento-evidencia?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "não consegui remover");
      setFotos((p) => (p || []).filter((x) => x.id !== id));
    } catch (e) { setErro(e.message); }
  }

  return (
    <div>
      <label className="block text-sm font-medium text-torg-dark mb-1">
        Evidência do recebimento <span className="text-xs font-normal text-torg-gray">(fotos do material)</span>
      </label>
      <div className="flex items-center gap-2 flex-wrap">
        {(fotos || []).map((f) => (
          <div key={f.id} className="relative group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.arquivoUrl} alt={f.nome} title={`${f.nome}${f.responsavel ? ` · ${f.responsavel}` : ""}`}
              className="w-14 h-14 object-cover rounded-lg border border-gray-200" />
            <button onClick={() => remover(f.id)} title="tirar da evidência"
              className="absolute -top-1.5 -right-1.5 bg-white border border-gray-200 rounded-full p-0.5 text-torg-gray hover:text-red-600 opacity-0 group-hover:opacity-100">
              <X size={11} />
            </button>
          </div>
        ))}
        {subindo > 0 && (
          <span className="w-14 h-14 rounded-lg border border-dashed border-gray-200 inline-flex items-center justify-center text-torg-gray">
            <Loader2 size={14} className="animate-spin" />
          </span>
        )}
        <button onClick={() => inputRef.current?.click()} disabled={subindo > 0}
          className="w-14 h-14 rounded-lg border border-dashed border-gray-300 text-torg-gray hover:border-torg-blue hover:text-torg-blue text-[11px] leading-tight disabled:opacity-50">
          + foto
        </button>
        {/* ⚠ `capture` deixa o celular abrir a câmera direto — quem recebe está no pátio, não na mesa */}
        <input ref={inputRef} type="file" accept="image/*" capture="environment" multiple className="hidden"
          onChange={(e) => enviar(e.target.files)} />
      </div>
      {erro && <p className="text-xs text-red-600 mt-1">{erro}</p>}
      {fotos && !fotos.length && subindo === 0 && (
        <p className="text-[11px] text-torg-gray-light mt-1">Sem foto ainda — a evidência fica guardada com a NF e a OP.</p>
      )}
    </div>
  );
}
