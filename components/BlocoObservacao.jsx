"use client";
import { MessageSquareText } from "lucide-react";

/**
 * O texto que alguém escreveu à mão — e que a tela precisa mostrar em vez de guardar.
 *
 * ⚠⚠ ISTO EXISTE PORQUE O PORTAL ESTAVA ENGOLINDO OBSERVAÇÃO. Matheus (16/09/2026): "quando alguém
 * sobe uma RM com observações escritas não está aparecendo". Medido no banco no mesmo dia: 48 RMs,
 * 14 itens de RM, 447 cotações e 1.266 itens de cotação com observação gravada — tudo invisível na
 * tela de compras. Texto que alguém digitou de propósito é a informação mais cara da tela: não se
 * escreve observação por acaso.
 *
 * ⚠ Fundo âmbar e ícone, não cinza-pequeno: a observação da RM JÁ aparecia no cabeçalho, em cinza
 * de 12px sem rótulo, e o Matheus não a via — "não está aparecendo NA CARA". Discreto demais é o
 * mesmo que ausente.
 */
export default function BlocoObservacao({ texto, rotulo = "Observação", autor, compacto = false, className = "" }) {
  const t = String(texto ?? "").trim();
  if (!t) return null;
  return (
    <div className={`${compacto ? "mt-1 px-2 py-1 text-[11px]" : "mt-2 px-3 py-2 text-[13px]"} bg-amber-50 border border-amber-200 rounded-lg text-amber-900 flex items-start gap-1.5 ${className}`}>
      <MessageSquareText size={compacto ? 12 : 14} className="mt-0.5 shrink-0 text-amber-600" />
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
        <b className="font-semibold">{rotulo}{autor ? ` (${autor})` : ""}:</b> {t}
      </span>
    </div>
  );
}
