"use client";
import { useEffect, useRef, useState } from "react";
import { limparDecimalDigitado, CASAS_PADRAO } from "@/lib/decimal-digitado";
import { numeroBR } from "@/lib/numero-br";

/**
 * O NÚMERO DO PAI COM AS CASAS QUE ESTE CAMPO ACEITA.
 *
 * ⚠⚠ "861,1199999999999" NUM CAMPO DE 80 px (21/09/2026). Na tela do fornecedor, a Qtd cotada da
 * RM T122-001 mostrava `861,11999` (o resto não cabia) e `957,60000`, enquanto a coluna ao lado —
 * que é texto já arredondado — dizia `861.12 KG`. Conferido no banco: `RMItem.peso` e
 * `CotacaoItem.qtdCotada` guardam mesmo `861.1199999999999`, resíduo binário de um cálculo antigo.
 *
 * ⚠⚠ O CONSERTO É NO COMPONENTE PORQUE A PROMESSA É DELE. Ele já capa o que é DIGITADO em `casas`
 * (`limparDecimalDigitado`) — então um valor vindo do pai com 13 casas viola, em silêncio, o
 * contrato do próprio campo, e a pessoa não consegue nem corrigir digitando. Consertar só a tela
 * da cotação deixaria as outras 52 que usam este campo com o mesmo defeito latente.
 *
 * ⚠ `casas` manda na APRESENTAÇÃO e na digitação — **não normaliza o que está gravado**. O resíduo
 * segue no banco; quem decide precisão de cálculo é a regra de domínio, no servidor (achado do
 * Codex, 21/09/2026).
 *
 * ⚠⚠ E NÃO PODE VOLTAR EM NOTAÇÃO CIENTÍFICA (achado do Codex): `String(0.0000001)` dá `"1e-7"`, e
 * `numeroBR` não lê expoente — o campo mostraria lixo e o valor viraria zero na volta. `toFixed`
 * devolve decimal fixo; se ainda assim vier expoente (número gigante), o valor passa como estava.
 */
function arredondar(v, casas) {
  const fixo = v.toFixed(casas);
  if (/e/i.test(fixo)) return String(v);
  // ⚠ zero à direita sai: o campo mostra "957,6", não "957,600000". O zero que a PESSOA digita
  // continua protegido — ele vive no texto em edição, que não passa por aqui.
  return fixo.includes(".") ? fixo.replace(/\.?0+$/, "") : fixo;
}

/** O valor do pai, como texto em português. Número vira "31,5"; texto passa direto. */
function paraTexto(v, casas) {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v !== "number") return String(v);
  if (!Number.isFinite(v)) return "";
  return (casas == null ? String(v) : arredondar(v, casas)).replace(".", ",");
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
  const [texto, setTexto] = useState(() => paraTexto(value, casas));
  const ultimoEnviado = useRef(texto);

  useEffect(() => {
    const exibir = paraTexto(value, casas);
    // ⚠⚠ QUEM DECIDE SE TROCA É O VALOR CRU, QUEM ENTRA NO CAMPO É O ARREDONDADO (achado do Codex,
    // 21/09/2026). `limparDecimalDigitado` deixa passar `"0.1234567"` — o corte por `casas` só vale
    // depois da VÍRGULA. Comparando contra o arredondado, o pai numérico devolveria `"0,123457"`,
    // que é um número DIFERENTE do digitado, e o campo se reescreveria no meio da digitação.
    const cru = paraTexto(value);
    // ⚠ compara NÚMERO, não string: "31,50", "31,5" e 31.5 são o mesmo valor, e trocar o texto
    // por causa da grafia apagaria o zero que a pessoa acabou de digitar.
    if (numeroBR(cru) !== numeroBR(texto) || (!cru && texto && numeroBR(texto) === 0)) {
      setTexto(exibir);
      ultimoEnviado.current = exibir;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, casas]);

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
