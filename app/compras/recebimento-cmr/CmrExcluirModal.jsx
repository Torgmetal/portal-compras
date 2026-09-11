"use client";
import { Loader2, Trash2, AlertCircle } from "lucide-react";

// EXCLUIR UM LANÇAMENTO — confirmação dupla (checkbox + botão).
//
// ⚠ A exclusão é permanente e QUEIMA O ÍNDICE R (ele fica reservado e a linha da planilha é limpa).
// Desde que existe o botão de EDITAR, excluir deixou de ser a saída para "faltou preencher" e passou
// a ser só para lançamento errado de verdade — o que torna a fricção daqui desejável.
export default function CmrExcluirModal({ excluir, setExcluir, confExcl, setConfExcl, excluindo, executarExcluir }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !excluindo && setExcluir(null)}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <AlertCircle size={18} className="text-red-600" />
          <h3 className="text-base font-bold text-torg-dark">Excluir lançamento CMR</h3>
        </div>
        <div className="px-5 py-4 space-y-3 text-sm">
          <p className="text-torg-dark">Você está prestes a excluir o rastreio abaixo. <strong className="text-red-600">Esta ação é permanente.</strong></p>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-[13px] space-y-0.5">
            <p><span className="text-torg-gray">Índice R:</span> <strong className="font-mono text-torg-blue">{excluir.importRef}</strong></p>
            <p><span className="text-torg-gray">Material:</span> {excluir.nome}</p>
            {excluir.fornecedor && <p><span className="text-torg-gray">Fornecedor:</span> {excluir.fornecedor}</p>}
            {excluir.nfNumero && <p><span className="text-torg-gray">NF:</span> {excluir.nfNumero}</p>}
          </div>
          <p className="text-[12px] text-torg-gray">O índice R continua reservado na planilha (a linha é limpa), e a exclusão fica registrada no log com seu usuário e horário.</p>
          <label className="flex items-start gap-2 cursor-pointer bg-red-50 border border-red-200 rounded-lg p-2.5">
            <input type="checkbox" checked={confExcl} onChange={(e) => setConfExcl(e.target.checked)} className="mt-0.5" />
            <span className="text-[13px] text-red-700">Confirmo que quero excluir o <strong>R {excluir.importRef}</strong> permanentemente.</span>
          </label>
        </div>
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={() => { setExcluir(null); setConfExcl(false); }} disabled={excluindo} className="px-4 py-2 text-sm text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100">Cancelar</button>
          <button onClick={executarExcluir} disabled={!confExcl || excluindo}
            className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
            {excluindo ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />} Excluir R {excluir.importRef}
          </button>
        </div>
      </div>
    </div>
  );
}
