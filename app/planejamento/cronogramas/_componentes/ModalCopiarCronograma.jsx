"use client";
import { AlertCircle, ChevronDown, Copy, Loader2, X } from "lucide-react";

// Copiar as tarefas deste cronograma para outra OP.
export function ModalCopiarCronograma({
  copiando,
  copiar,
  copiarErro,
  copiarOp,
  copiarOps,
  copiarProgresso,
  copiarTitulo,
  detail,
  loadingCopiarOps,
  selecionarOpCopia,
  setCopiarProgresso,
  setCopiarTitulo,
  setShowCopiar,
}) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !copiando && setShowCopiar(false)}>
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-base font-bold text-torg-dark flex items-center gap-2"><Copy size={16} className="text-torg-blue" /> Copiar para outra OP</h3>
          <button onClick={() => !copiando && setShowCopiar(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-xs text-torg-gray">
            Cria um novo cronograma a partir de <b>{detail.titulo}</b>, com a <b>mesma estrutura, datas e durações</b>.
          </p>
          <div>
            <label className="block text-xs font-medium text-torg-gray mb-1">OP de destino *</label>
            <div className="relative">
              <select value={copiarOp} onChange={(e) => selecionarOpCopia(e.target.value)} disabled={loadingCopiarOps} autoFocus
                className="appearance-none w-full pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-torg-blue focus:border-torg-blue disabled:opacity-60">
                <option value="">{loadingCopiarOps ? "Carregando OPs…" : "Selecione a OP de destino…"}</option>
                {copiarOps.map((op) => (
                  <option key={op.id} value={op.numero}>{op.numero} — {op.cliente}{op.obra ? ` (${op.obra})` : ""}{op.cronogramasExistentes > 0 ? ` · já tem ${op.cronogramasExistentes}` : ""}</option>
                ))}
              </select>
              <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-torg-gray pointer-events-none" />
            </div>
            {!loadingCopiarOps && copiarOps.length === 0 && (
              <p className="text-[11px] text-amber-600 mt-1">Nenhuma OP sem cronograma disponível.</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-gray mb-1">Título / descrição *</label>
            <input type="text" value={copiarTitulo} onChange={(e) => setCopiarTitulo(e.target.value)}
              placeholder="Ex: ENC 0333 - Cobertura de Caldeira"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-torg-blue focus:border-torg-blue" />
          </div>
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={copiarProgresso} onChange={(e) => setCopiarProgresso(e.target.checked)}
              className="mt-0.5 rounded border-gray-300 text-torg-blue focus:ring-torg-blue" />
            <span className="text-xs text-torg-gray">
              <b>Copiar o progresso da OP de origem</b> (% concluído, execução e baseline). Desmarque para começar do zero.
            </span>
          </label>
          {copiarErro && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2 flex items-start gap-2">
              <AlertCircle size={13} className="mt-0.5 shrink-0" /> {copiarErro}
            </div>
          )}
        </div>
        <div className="p-5 border-t border-gray-100 flex items-center justify-end gap-3">
          <button onClick={() => setShowCopiar(false)} disabled={copiando}
            className="px-4 py-2 text-sm text-torg-gray border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">Cancelar</button>
          <button onClick={copiar} disabled={copiando || !copiarOp.trim() || !copiarTitulo.trim()}
            className="px-4 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue/90 inline-flex items-center gap-2 disabled:opacity-50">
            {copiando ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />}
            {copiando ? "Copiando…" : "Copiar cronograma"}
          </button>
        </div>
      </div>
    </div>
  );
}
