"use client";
import { useEffect, useState } from "react";

// ─── PRÉVIA ───────────────────────────────────────────────────────────────────
// Vitor (30/08/2026): "deixa para eu conseguir ver para validar". A campanha é travada por data,
// então antes de setembro não há o que olhar — e validar depois que está no ar para 30 pessoas é
// tarde. `?campanha=1` em qualquer tela liga a parte visual sem mexer na data.
//
// ⚠ Lido de `window.location` num efeito, e não por `useSearchParams`: este hook exige fronteira de
// Suspense nas páginas estáticas, e a faixa vive no layout raiz, que envolve todas elas.
export const PARAM_PREVIA = "campanha";

const CHAVE_PREVIA = "torg:campanha-previa";

export function usarPrevia() {
  const [previa, setPrevia] = useState(false);
  useEffect(() => {
    // ⚠⚠ A PRÉVIA PRECISA DURAR A SESSÃO. Só lendo a URL ela morre no primeiro clique — o parâmetro
    // fica na página que você abriu e navegar para outro portal já o perde. Vitor (30/08/2026): "o
    // laço só apareceu na tela do portal de compra". Não era o código faltando nos outros portais:
    // era a prévia sumindo na navegação. `?campanha=0` desliga.
    let ligado = false;
    let param = null;
    try { param = new URLSearchParams(window.location.search).get(PARAM_PREVIA); } catch { /* ok */ }
    if (param !== null) ligado = param !== "0";
    try {
      if (param !== null) {
        if (ligado) sessionStorage.setItem(CHAVE_PREVIA, "1");
        else sessionStorage.removeItem(CHAVE_PREVIA);
      } else {
        ligado = sessionStorage.getItem(CHAVE_PREVIA) === "1";
      }
    } catch { /* navegador sem storage: vale só o parâmetro da URL */ }
    setPrevia(ligado);
  }, []);
  return previa;
}
