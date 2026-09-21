"use client";
import { useEffect, useState } from "react";
import { X, Loader2, Save } from "lucide-react";
import ReferenciasClienteEditor, { arvoreParaEditor, REFERENCIAS_VAZIAS } from "./ReferenciasClienteEditor";

// Edita as referências do CONTRATO (as do aditivo vivem no aditivo). Carrega os termos do cliente
// e a árvore atual; ao salvar, o servidor regrava as linhas e recalcula `OP.refCliente`.
export default function ModalReferenciasCliente({ opId, onClose, onSaved }) {
  const [dados, setDados] = useState(null);
  const [valor, setValor] = useState(REFERENCIAS_VAZIAS);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    fetch(`/api/comercial/op/${opId}/referencias`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (j.error) throw new Error(j.error); setDados(j); setValor(arvoreParaEditor(j.base)); })
      .catch((e) => setErro(e.message));
  }, [opId]);

  const salvar = async () => {
    setSalvando(true); setErro("");
    try {
      const r = await fetch(`/api/comercial/op/${opId}/referencias`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(valor) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Não foi possível salvar.");
      onSaved?.(j);
    } catch (e) { setErro(e.message); setSalvando(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !salvando && onClose()}>
      <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-torg-dark">Referências do cliente</h3>
            <p className="text-xs text-torg-gray">{dados?.cliente?.nome ? `Termos de ${dados.cliente.nome}` : "Rótulos genéricos — cadastre os termos do cliente em Comercial › Clientes"}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-6 py-5">
          {!dados && !erro && <p className="text-sm text-torg-gray flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Carregando…</p>}
          {dados && <ReferenciasClienteEditor termos={dados.cliente ? dados.termos && Object.fromEntries(Object.entries(dados.termos)) : null} valor={valor} onChange={setValor} />}
          {erro && <p className="text-sm text-red-600 mt-3">{erro}</p>}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} disabled={salvando} className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-torg-gray hover:bg-gray-50">Cancelar</button>
          <button onClick={salvar} disabled={salvando || !dados} className="px-4 py-2 text-sm rounded-lg bg-torg-blue text-white font-medium inline-flex items-center gap-2 disabled:opacity-50">
            {salvando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
