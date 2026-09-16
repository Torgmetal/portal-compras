"use client";
import { useEffect, useRef, useState } from "react";
import { Calendar } from "lucide-react";
import { isoParaBR, mascararDataBR, brParaIso } from "@/lib/data-digitada";

/**
 * Campo de data em português — o substituto de `<input type="date">`.
 *
 * ⚠⚠ O NAVEGADOR NÃO OBEDECE À PÁGINA NO FORMATO DA DATA: `type="date"` usa o idioma da interface
 * do navegador, e quem o tem em inglês via `mm/dd/yyyy` numa tela inteiramente em português —
 * FORNECEDOR incluído, onde a data lida ao contrário vira prazo de entrega errado. Nem `lang`, nem
 * o locale da página mudam isso (medido). Aqui a máscara é `dd/mm/aaaa` em qualquer máquina.
 *
 * ⚠ O CALENDÁRIO NATIVO CONTINUA: o botão chama `showPicker()` num `type="date"` escondido — no
 * celular é ele que evita digitar oito dígitos com o polegar. Onde `showPicker` não existe
 * (Firefox antigo, WebView), o botão simplesmente não aparece e a digitação segue funcionando.
 *
 * `value` e `onChange` continuam em ISO (`YYYY-MM-DD`), como o `type="date"` — nada muda no banco
 * nem nas rotas.
 */
export default function CampoData({ value, onChange, className = "", disabled, ...resto }) {
  const [texto, setTexto] = useState(() => isoParaBR(value));
  const refNativo = useRef(null);
  const [temPicker, setTemPicker] = useState(false);

  // ⚠ Lido do `window` e dentro do efeito: no servidor não existe `HTMLInputElement`, e o valor
  // inicial precisa ser o mesmo nos dois lados para não dar erro de hidratação.
  useEffect(() => { setTemPicker("showPicker" in (window.HTMLInputElement?.prototype || {})); }, []);

  // ⚠ Só adota o valor de fora quando ele é OUTRA data: senão, apagar o dia para corrigir faria o
  // campo se reescrever sozinho no meio da digitação.
  useEffect(() => {
    const deFora = isoParaBR(value);
    if (deFora !== brParaIso(texto) && deFora !== texto) {
      if (brParaIso(texto) !== String(value || "").slice(0, 10)) setTexto(deFora);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const digitou = (bruto) => {
    const t = mascararDataBR(bruto);
    setTexto(t);
    const iso = brParaIso(t);
    // ⚠ Apagar tem de chegar ao pai: campo vazio é "sem data", não "mantenha a anterior".
    if (iso || !t) onChange(iso);
  };

  return (
    <span className="relative inline-flex items-center w-full">
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="dd/mm/aaaa"
        maxLength={10}
        value={texto}
        disabled={disabled}
        onChange={(e) => digitou(e.target.value)}
        className={className}
        {...resto}
      />
      {temPicker && !disabled && (
        <>
          <button type="button" tabIndex={-1} aria-label="Abrir o calendário"
            onClick={() => refNativo.current?.showPicker?.()}
            className="absolute right-1.5 text-torg-gray hover:text-torg-blue">
            <Calendar size={14} />
          </button>
          {/* ⚠⚠ ESTE `type="date"` É O NATIVO E TEM DE CONTINUAR SENDO. Ele existe só para abrir o
              calendário do sistema (`showPicker`) e nunca é visto. Uma varredura minha que trocava
              `type="date"` por `<CampoData>` pegou também este, aqui dentro: o componente passou a
              se renderizar dentro de si mesmo e a tela do fornecedor abriu com 2.546 campos
              aninhados antes de o React cortar (16/09/2026). Converter em massa exige olhar o
              próprio conversor. */}
          <input ref={refNativo} type="date" tabIndex={-1} aria-hidden="true"
            value={brParaIso(texto) || ""}
            onChange={(iso) => { setTexto(isoParaBR(iso)); onChange(iso); }}
            className="absolute right-1.5 w-0 h-0 opacity-0 pointer-events-none" />
        </>
      )}
    </span>
  );
}
