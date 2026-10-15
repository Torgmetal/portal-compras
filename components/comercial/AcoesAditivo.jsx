"use client";
import { useState } from "react";
import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import ConfirmModal from "@/components/admin/ConfirmModal";
import { useStore } from "@/lib/store";

// Editar e excluir o aditivo (Matheus, 15/10/2026, OP-105: "não tem a opção de editar e nem a opção
// de excluir"). Editar vale também para o divulgado; excluir só aparece no rascunho — e o servidor
// ainda recusa se houver medição, RM ou verba penduradas (lib/aditivo-edicao.js).
export default function AcoesAditivo({ opId, aditivo, onExcluido }) {
  const { showToast } = useStore();
  const [confirmar, setConfirmar] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const rascunho = aditivo.status === "RASCUNHO";

  const excluir = async () => {
    setExcluindo(true);
    try {
      const r = await fetch(`/api/comercial/aditivo/${aditivo.id}`, { method: "DELETE" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Não foi possível excluir o aditivo.");
      showToast(`Aditivo ${aditivo.numero} excluído`, "success");
      onExcluido?.();
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setExcluindo(false);
      setConfirmar(false);
    }
  };

  return (
    <>
      <Link href={`/comercial/${opId}/aditivo/${aditivo.id}/editar`}
        className="px-3 py-1.5 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 bg-white border border-gray-200 text-torg-dark hover:bg-gray-50"
        title={rascunho ? "Corrigir OC, TAG, receita, prazo ou descrição" : "Corrigir o aditivo — depois, reenvie o comunicado aos setores"}>
        <Pencil size={14} /> Editar
      </Link>
      {rascunho && (
        <button type="button" onClick={() => setConfirmar(true)}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 bg-white border border-red-200 text-red-700 hover:bg-red-50">
          <Trash2 size={14} /> Excluir
        </button>
      )}
      <ConfirmModal open={confirmar} onClose={() => !excluindo && setConfirmar(false)} onConfirm={excluir} loading={excluindo} variant="destrutivo"
        titulo={`Excluir o aditivo ${aditivo.numero}?`} labelConfirmar="Excluir aditivo"
        mensagem="Saem junto a receita, a OC e as TAGs deste aditivo. Se houver medição, RM ou solicitação de verba ligada a ele, a exclusão é recusada e a mensagem diz o que desvincular antes." />
    </>
  );
}
