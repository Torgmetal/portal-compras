"use client";
import { useEffect, useRef, useState } from "react";
import { limparDecimalDigitado, CASAS_PADRAO } from "@/lib/decimal-digitado";
import { numeroBR } from "@/lib/numero-br";

/** O valor do pai, como texto em português. Número vira "31,5"; texto passa direto. */
function paraTexto(v) {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v).replace(".", ",") : "";
  return String(v);
}

/**
 * Campo de quantidade/preço/percentual — o substituto de `<input type="number">`.
 *
 * ⚠⚠ É DE TEXTO DE PROPÓSITO, E ISSO É CONSERTO, NÃO PREFERÊNCIA. O input numérico do navegador
 * DESCARTA a vírgula: "31,02" vira "3102". O porquê, com a medição, está em `lib/decimal-digitado`.
 *
 * ⚠ `inputMode="decimal"` mantém o teclado numérico no celular, que era a única coisa que o
 * `type="number"` entregava de útil aqui.
 *
 * ⚠⚠ O TEXTO DIGITADO TEM VIDA PRÓPRIA, E SEM ISSO A VÍRGULA NÃO SOBREVIVE. Metade das telas
 * guarda NÚMERO no estado (`onChange={(txt) => setDias(numeroBR(txt))}`): ao teclar a vírgula de
 * "31,5", o pai guardaria 31, devolveria "31" para cá e a vírgula sumiria da tela antes do
 * próximo dígito — o campo ficaria impossível de usar justamente para decimais. Então o texto em
 * edição fica aqui, e o valor do pai só o substitui quando os dois representam números
 * DIFERENTES: é assim que um reset, um cálculo automático ou o preenchimento por IA continuam
 * mandando na tela sem atrapalhar quem está no meio de uma digitação.
 */
export default function CampoDecimal({ value, onChange, casas = CASAS_PADRAO, className = "", title, ...resto }) {
  const [texto, setTexto] = useState(() => paraTexto(value));
  const ultimoEnviado = useRef(texto);

  useEffect(() => {
    const deFora = paraTexto(value);
    // ⚠ compara NÚMERO, não string: "31,50", "31,5" e 31.5 são o mesmo valor, e trocar o texto
    // por causa da grafia apagaria o zero que a pessoa acabou de digitar.
    if (numeroBR(deFora) !== numeroBR(texto) || (!deFora && texto && numeroBR(texto) === 0)) {
      setTexto(deFora);
      ultimoEnviado.current = deFora;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={texto}
      onChange={(e) => {
        const limpo = limparDecimalDigitado(e.target.value, casas);
        setTexto(limpo);
        ultimoEnviado.current = limpo;
        onChange(limpo);
      }}
      title={title || `Use vírgula para os decimais — até ${casas} casas`}
      className={className}
      {...resto}
    />
  );
}
