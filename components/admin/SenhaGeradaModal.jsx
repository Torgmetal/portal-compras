"use client";
import { useState, useEffect } from "react";
import { CheckCircle2, Eye, EyeOff, Copy, Check, X } from "lucide-react";

/**
 * Modal exibido uma única vez após criação ou reset de usuário,
 * revelando a senha temporária gerada.
 *
 * @param {object}   props
 * @param {boolean}  props.open       - Controla visibilidade
 * @param {Function} props.onClose    - Chamado ao fechar (redireciona o pai)
 * @param {string}   props.senha      - Senha temporária em plaintext
 * @param {string}   props.nomeUsuario
 * @param {string}   props.emailUsuario
 */
export default function SenhaGeradaModal({
  open,
  onClose,
  senha,
  nomeUsuario,
  emailUsuario,
}) {
  const [visivel, setVisivel] = useState(false);
  const [copiado, setCopiado] = useState(false);

  // Fechar com ESC
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // Resetar estado interno ao abrir
  useEffect(() => {
    if (open) {
      setVisivel(false);
      setCopiado(false);
    }
  }, [open]);

  if (!open) return null;

  function copiar() {
    navigator.clipboard.writeText(senha).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        {/* Cabeçalho */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-800 flex items-center gap-2">
            <CheckCircle2 size={18} className="text-green-500" />
            Usuário criado com sucesso
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        </div>

        {/* Corpo */}
        <div className="px-6 py-5 space-y-4">
          <div>
            <p className="text-sm text-gray-600">
              O usuário <span className="font-semibold text-torg-dark">{nomeUsuario}</span>{" "}
              foi criado com o e-mail{" "}
              <span className="font-semibold text-torg-dark">{emailUsuario}</span>.
            </p>
          </div>

          <div className="rounded-lg border border-torg-blue/25 bg-torg-blue-50/40 px-4 py-3">
            <p className="text-xs font-semibold text-torg-gray uppercase tracking-wide mb-2">
              Senha temporária
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-white border border-gray-200 px-3 py-2 text-base font-mono tracking-widest text-torg-dark select-all">
                {visivel ? senha : "••••••••"}
              </code>
              <button
                onClick={() => setVisivel((v) => !v)}
                title={visivel ? "Ocultar senha" : "Mostrar senha"}
                className="p-2 rounded-lg text-torg-gray hover:text-torg-dark hover:bg-white border border-transparent hover:border-gray-200 transition-colors"
              >
                {visivel ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
              <button
                onClick={copiar}
                title="Copiar senha"
                className="p-2 rounded-lg text-torg-gray hover:text-torg-dark hover:bg-white border border-transparent hover:border-gray-200 transition-colors"
              >
                {copiado ? (
                  <Check size={16} className="text-green-500" />
                ) : (
                  <Copy size={16} />
                )}
              </button>
            </div>
          </div>

          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
            <p className="text-xs text-amber-700 leading-relaxed">
              <span className="font-semibold">Anote agora.</span> Esta senha não será
              exibida novamente. O usuário deverá alterá-la no primeiro acesso.
            </p>
          </div>
        </div>

        {/* Rodapé */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 text-sm font-medium bg-torg-blue hover:bg-torg-blue-700 text-white rounded-lg transition-colors"
          >
            Entendido, fechar
          </button>
        </div>
      </div>
    </div>
  );
}
