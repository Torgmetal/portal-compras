"use client";
import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";

/**
 * IMPORTAR A LQC — trazer o quantitativo pronto em vez de redigitar.
 *
 * Vitor (23/08/2026): "importarmos áreas levantadas nessa planilha… para preencher apenas os
 * custos". Medir a estrutura e tirar o coeficiente de superfície é trabalho de projeto, feito uma
 * vez no Excel; o custo é o que muda toda semana. Redigitar 11 áreas para conferir um preço é o
 * jeito mais rápido de a ferramenta nova não ser usada.
 */
export function ImportarLqc({ id, onPronto, showToast }) {
  const [enviando, setEnviando] = useState(false);
  const ref = useRef(null);

  const enviar = async (arquivo) => {
    if (!arquivo) return;
    setEnviando(true);
    try {
      const fd = new FormData();
      fd.append("arquivo", arquivo);
      const r = await fetch(`/api/comercial/estudos/${id}/importar`, { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
      const s = j.resumo;
      showToast(`${s.areas} áreas · ${s.pesoKg.toLocaleString("pt-BR")} kg${s.comPreco ? ` · ${s.comPreco} com preço` : ""}`, "success");
      for (const a of j.avisos || []) showToast(a, "error");
      onPronto(j);
    } catch (e) { showToast(e.message, "error"); }
    finally { setEnviando(false); if (ref.current) ref.current.value = ""; }
  };

  return (
    <>
      <input ref={ref} type="file" accept=".xlsx,.xlsm,.xlsb" className="hidden"
        onChange={(e) => enviar(e.target.files?.[0])} />
      <button onClick={() => ref.current?.click()} disabled={enviando}
        className="text-[12px] font-semibold text-torg-blue border border-torg-blue/30 rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5 hover:bg-torg-blue-50 disabled:opacity-50">
        {enviando ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Importar LQC
      </button>
    </>
  );
}
