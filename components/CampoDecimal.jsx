"use client";
import { limparDecimalDigitado, CASAS_PADRAO } from "@/lib/decimal-digitado";

/**
 * Campo de quantidade/preço/percentual — o substituto de `<input type="number">`.
 *
 * ⚠⚠ É DE TEXTO DE PROPÓSITO, E ISSO É CONSERTO, NÃO PREFERÊNCIA. O input numérico do navegador
 * DESCARTA a vírgula: "31,02" vira "3102". O porquê, com a medição, está em `lib/decimal-digitado`.
 *
 * ⚠ `inputMode="decimal"` mantém o teclado numérico no celular, que era a única coisa que o
 * `type="number"` entregava de útil aqui.
 *
 * O estado guarda o TEXTO; quem calcula chama `numeroBR`. É como o resto do modal já funcionava.
 */
export default function CampoDecimal({ value, onChange, casas = CASAS_PADRAO, className = "", title, ...resto }) {
  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={value ?? ""}
      onChange={(e) => onChange(limparDecimalDigitado(e.target.value, casas))}
      title={title || `Use vírgula para os decimais — até ${casas} casas`}
      className={className}
      {...resto}
    />
  );
}
