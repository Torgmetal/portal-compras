"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { Camera, Loader2, X, AlertTriangle } from "lucide-react";
import { reduzImagem } from "@/lib/imagem-cliente";

// ─── AS FOTOS DO ENSAIO, EM QUALQUER RELATÓRIO ────────────────────────────────
// Vitor (22/08/2026): "estou sentindo falta de um campo para anexar as fotos dos
// testes, tanto para o computador quanto para o celular; posso colocar foto em
// qualquer relatório — alguns têm campos específicos, e para os que não têm você cria
// uma página para anexar essas imagens".
//
// No celular a captura já existia; no computador, não existia em lugar nenhum — quem
// monta o relatório na mesa não tinha como juntar a foto do ensaio. Agora é o mesmo
// componente para os quatro tipos, e no PDF a folha de fotos sai no mesmo formato das
// demais (ver paginaDeFotos em lib/relatorio-evs-pdf.js).
//
// ⚠ A foto nasce AMARRADA ao relatório (`relatorioId`), não solta na fila da OP. Foto
// solta obriga alguém a juntá-la depois, e evidência de ensaio reprovado é justamente
// o que não pode se perder no caminho.
export default function Fotos({ rel, travado }) {
  const [fotos, setFotos] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const inputRef = useRef(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/campo/foto?relatorioId=${encodeURIComponent(rel.id)}`);
      const j = await r.json();
      setFotos(j.fotos || []);
    } catch { setFotos([]); }
  }, [rel.id]);

  useEffect(() => { carregar(); }, [carregar]);

  async function receber(e) {
    const arquivos = [...(e.target.files || [])];
    e.target.value = "";
    if (!arquivos.length) return;
    setEnviando(true); setErro("");
    try {
      for (const arq of arquivos) {
        const blob = await reduzImagem(arq);
        const fd = new FormData();
        fd.append("file", new File([blob], "foto.jpg", { type: "image/jpeg" }));
        fd.append("opNumero", rel.opNumero);
        fd.append("tipo", rel.tipo);
        fd.append("relatorioId", rel.id);
        const r = await fetch("/api/campo/foto", { method: "POST", body: fd });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Falha ao enviar a foto.");
      }
      await carregar();
    } catch (e2) { setErro(e2.message); } finally { setEnviando(false); }
  }

  async function remover(id) {
    if (!confirm("Remover esta foto do relatório?")) return;
    try {
      const r = await fetch(`/api/campo/foto?id=${id}`, { method: "DELETE" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Não foi possível remover.");
      await carregar();
    } catch (e) { setErro(e.message); }
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm">
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-[12px] font-bold text-torg-dark">
          Fotos do ensaio {fotos?.length ? <span className="text-torg-gray font-normal">· {fotos.length}</span> : null}
        </p>
        {!travado && (
          <>
            <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={receber} />
            <button onClick={() => inputRef.current?.click()} disabled={enviando}
              className="text-[11px] font-semibold text-torg-blue border border-torg-blue-300 rounded-lg px-2.5 py-1 hover:bg-torg-blue-50 disabled:opacity-50 inline-flex items-center gap-1.5">
              {enviando ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />} Anexar foto
            </button>
          </>
        )}
      </div>

      {erro && <p className="text-[11px] text-red-600 mb-2 inline-flex items-center gap-1.5"><AlertTriangle size={12} /> {erro}</p>}

      {fotos === null ? (
        <p className="text-[11px] text-torg-gray inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> carregando…</p>
      ) : fotos.length ? (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {fotos.map((f) => (
            <div key={f.id} className="relative group">
              <a href={f.url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt={f.marca || "foto do ensaio"} className="w-full h-20 object-cover rounded-lg border border-gray-200" />
              </a>
              {f.marca && <p className="text-[9px] text-torg-gray truncate mt-0.5">{f.marca}</p>}
              {!travado && (
                <button onClick={() => remover(f.id)} title="Remover"
                  className="absolute top-1 right-1 bg-white/90 rounded-full p-0.5 text-torg-gray hover:text-red-600 opacity-0 group-hover:opacity-100">
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-torg-gray">
          Nenhuma foto. {travado ? "" : "As que você anexar saem numa folha própria no fim do PDF, no mesmo formato do relatório."}
        </p>
      )}
    </div>
  );
}
