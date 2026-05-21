"use client";
import { AlertTriangle, Info, Loader2, X } from "lucide-react";

/**
 * Modal de confirmação reutilizável para ações sensíveis.
 *
 * @param {object}  props
 * @param {boolean} props.open           - Controla visibilidade
 * @param {Function} props.onClose       - Chamado ao cancelar ou clicar fora
 * @param {Function} props.onConfirm     - Chamado ao confirmar
 * @param {string}  props.titulo         - Título do modal
 * @param {string}  props.mensagem       - Corpo explicativo
 * @param {string}  [props.labelConfirmar="Confirmar"] - Texto do botão de confirmação
 * @param {boolean} [props.loading=false]              - Desabilita botões e mostra spinner
 * @param {"destrutivo"|"padrao"} [props.variant="padrao"] - Estilo do botão de confirmação
 */
export default function ConfirmModal({
  open,
  onClose,
  onConfirm,
  titulo,
  mensagem,
  labelConfirmar = "Confirmar",
  loading = false,
  variant = "padrao",
}) {
  if (!open) return null;

  const btnConfirmar =
    variant === "destrutivo"
      ? "bg-red-500 hover:bg-red-600 text-white"
      : "bg-torg-blue hover:bg-torg-blue-700 text-white";

  const IconeTitulo = variant === "destrutivo" ? AlertTriangle : Info;
  const corIcone =
    variant === "destrutivo" ? "text-red-500" : "text-torg-blue";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        {/* Cabeçalho */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-800 flex items-center gap-2">
            <IconeTitulo size={18} className={corIcone} />
            {titulo}
          </h3>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        {/* Corpo */}
        <div className="px-6 py-5">
          <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{mensagem}</p>
        </div>

        {/* Rodapé */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-5 py-2 text-sm font-medium rounded-lg flex items-center gap-2 disabled:opacity-50 ${btnConfirmar}`}
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {loading ? "Processando..." : labelConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
