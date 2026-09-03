"use client";
// ─── ESCOLHER DO BANCO DE FOTOS ───────────────────────────────────────────────
//
// Vitor (03/09/2026): "quando adicionarmos uma foto em algum lugar quero que ela fique em todos os
// lugares que temos para colocar foto, para não ter que ficar subindo sempre no portal".
//
// ⚠ AS DA OBRA PRIMEIRO. Quem monta o portal da OP-118 procura foto da 118; a institucional
// (fachada, equipe, uma obra parecida) serve de complemento e vem depois, num bloco à parte. Uma
// grade única, ordenada por data, faria a pessoa caçar a foto da própria obra no meio das outras.
import { useEffect, useState } from "react";
import { Loader2, Check, Images } from "lucide-react";

export default function SeletorFotos({ opId, opNumero, aberto, onFechar, onEscolher, jaUsadas = [] }) {
  const [dados, setDados] = useState(null);
  const [sel, setSel] = useState(() => new Set());
  const usadas = new Set(jaUsadas.map((u) => String(u)));

  useEffect(() => {
    if (!aberto) return;
    setDados(null); setSel(new Set());
    const q = opId ? `?opId=${encodeURIComponent(opId)}` : opNumero ? `?opNumero=${encodeURIComponent(opNumero)}` : "";
    fetch(`/api/fotos${q}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setDados(j?.daObra ? j : { daObra: [], outras: [] }))
      .catch(() => setDados({ daObra: [], outras: [] }));
  }, [aberto, opId, opNumero]);

  if (!aberto) return null;

  const alternar = (f) => setSel((p) => {
    const n = new Set(p);
    if (n.has(f.url)) n.delete(f.url); else n.add(f.url);
    return n;
  });

  const confirmar = () => {
    const todas = [...(dados?.daObra || []), ...(dados?.outras || [])];
    onEscolher(todas.filter((f) => sel.has(f.url)).map((f) => ({ url: f.url, legenda: f.legenda || "" })));
    onFechar();
  };

  const grade = (lista, vazio) => (
    !lista.length ? <p className="text-[12px] text-torg-gray px-1 py-2">{vazio}</p> : (
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {lista.map((f) => {
          const on = sel.has(f.url);
          const ja = usadas.has(f.url);
          return (
            <button key={f.id} onClick={() => alternar(f)} disabled={ja}
              className={`relative rounded-lg overflow-hidden border-2 text-left ${on ? "border-torg-orange" : "border-transparent hover:border-torg-blue-200"} ${ja ? "opacity-40 cursor-not-allowed" : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt={f.legenda || ""} className="w-full h-24 object-cover" />
              {(f.legenda || f.op) && (
                <span className="block text-[10px] text-torg-gray truncate px-1.5 py-1 bg-white">
                  {f.legenda || `OP-${f.op}`}
                </span>
              )}
              {on && <span className="absolute top-1 right-1 bg-torg-orange text-white rounded-full p-0.5"><Check size={11} /></span>}
              {ja && <span className="absolute inset-x-0 bottom-0 text-[9.5px] text-center bg-torg-dark/70 text-white py-0.5">já está aqui</span>}
            </button>
          );
        })}
      </div>
    )
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={onFechar}>
      <div className="bg-white rounded-xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2">
          <Images size={15} className="text-torg-blue" />
          <h3 className="text-[14px] font-bold text-torg-dark">Banco de fotos</h3>
          <span className="text-[11.5px] text-torg-gray">toda foto subida no portal ou num relatório aparece aqui</span>
          <button onClick={onFechar} className="ml-auto text-[12px] text-torg-gray hover:text-torg-dark">fechar</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!dados && <p className="text-[13px] text-torg-gray inline-flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> abrindo o banco…</p>}
          {dados && (
            <>
              <div>
                <p className="text-[10.5px] font-semibold text-torg-gray uppercase tracking-wide mb-1.5">Desta obra</p>
                {grade(dados.daObra, "Nenhuma foto desta obra no banco ainda — as que você subir aqui entram sozinhas.")}
              </div>
              <div>
                <p className="text-[10.5px] font-semibold text-torg-gray uppercase tracking-wide mb-1.5">De outras obras</p>
                {grade(dados.outras, "Nada por aqui ainda.")}
              </div>
            </>
          )}
        </div>

        <div className="px-4 py-3 border-t border-gray-200 flex items-center gap-3">
          <span className="text-[12px] text-torg-gray">{sel.size ? `${sel.size} escolhida(s)` : "nenhuma escolhida"}</span>
          <button onClick={confirmar} disabled={!sel.size}
            className="ml-auto text-[12.5px] font-semibold px-3 py-1.5 rounded-md bg-torg-blue text-white disabled:opacity-40 hover:bg-torg-blue-700">
            Usar as escolhidas
          </button>
        </div>
      </div>
    </div>
  );
}
