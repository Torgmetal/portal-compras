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
  const [previa, setPrevia] = useState(null);
  useEffect(() => {
    // ⚠⚠ A PRÉVIA PRECISA DURAR A SESSÃO. Só lendo a URL ela morre no primeiro clique — o parâmetro
    // fica na página que você abriu e navegar para outro portal já o perde. Vitor (30/08/2026): "o
    // laço só apareceu na tela do portal de compra". Não era o código faltando nos outros portais:
    // era a prévia sumindo na navegação. `?campanha=0` desliga.
    // ⚠ O VALOR DIZ QUAL CAMPANHA: `?campanha=outubro-rosa` mostra o Outubro Rosa ainda em setembro;
    // `?campanha=1` mostra a do mês (ver `campanhaExibida` em lib/campanha.js).
    let valor = null;
    let param = null;
    try { param = new URLSearchParams(window.location.search).get(PARAM_PREVIA); } catch { /* ok */ }
    if (param !== null && param !== "0") valor = param || "1";
    try {
      if (param !== null) {
        if (valor) sessionStorage.setItem(CHAVE_PREVIA, valor);
        else sessionStorage.removeItem(CHAVE_PREVIA);
      } else {
        valor = sessionStorage.getItem(CHAVE_PREVIA);
      }
    } catch { /* navegador sem storage: vale só o parâmetro da URL */ }
    setPrevia(valor);
  }, []);
  return previa;
}
