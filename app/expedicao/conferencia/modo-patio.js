"use client";
import { useCallback, useEffect, useState } from "react";

// MODO PÁTIO — Matheus (08/09/2026): "quando clicar em iniciar conferencia entrar em modo tela
// full no celular para não ter chance do operador sair sem querer". Compartilhado entre a lista
// (ConferenciaClient.jsx, onde o gesto de toque acontece) e a sessão (SessaoClient.jsx, onde a
// moldura de campo é exibida) — por isso mora um nível acima do `[id]`.
//
// ⚠⚠ TELA CHEIA DE VERDADE (Fullscreen API) SÓ EXISTE NO ANDROID/DESKTOP. No iPhone — Safari,
// Chrome, qualquer navegador — é limitação do WebKit da Apple, não dá pra contornar em JS:
// `document.documentElement.requestFullscreen` nem existe. O único jeito real de abrir sem a
// barra do navegador no iPhone é o operador adicionar a tela à Tela de Início (vira "standalone",
// ver `appleWebApp` no metadata das páginas). Por isso o modo pátio tem DOIS níveis: a moldura
// cobrindo a viewport (funciona sempre, é só CSS) e a tela cheia do sistema operacional (só onde
// o navegador suporta) — perder o segundo não pode quebrar o primeiro.

/** Pede tela cheia de verdade, se o navegador suportar. Nunca lança — falha vira silêncio, a
 *  moldura de CSS cobre a tela do mesmo jeito. Exige gesto do usuário (clique/toque); chamada
 *  fora de um clique é ignorada pelo navegador. */
export function pedirTelaCheia() {
  const el = typeof document !== "undefined" && document.documentElement;
  if (!el?.requestFullscreen) return;
  el.requestFullscreen().catch(() => {});
}

const suportaFullscreen = () =>
  typeof document !== "undefined" && !!document.documentElement.requestFullscreen;

const emStandalone = () =>
  typeof window !== "undefined" &&
  (window.navigator.standalone === true || window.matchMedia?.("(display-mode: standalone)")?.matches === true);

/** Estado da tela cheia do sistema — pra saber se o botão do cabeçalho mostra "entrar" ou "sair". */
export function usarModoPatio() {
  const [telaCheia, setTelaCheia] = useState(false);
  const [suporta] = useState(suportaFullscreen);
  const [standalone] = useState(emStandalone);

  useEffect(() => {
    const mudou = () => setTelaCheia(!!document.fullscreenElement);
    mudou();
    document.addEventListener("fullscreenchange", mudou);
    return () => document.removeEventListener("fullscreenchange", mudou);
  }, []);

  const alternar = useCallback(() => {
    if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
    pedirTelaCheia();
  }, []);

  return { telaCheia, suporta, standalone, alternar };
}

// ⚠ Sem media query de CSS pra decidir isto: precisa ser um valor de JS porque a moldura de campo
// TROCA o que é renderizado (não só como aparece) — a sidebar por trás não pode ficar montada e
// escondida, tem que sumir de verdade. 767px é o mesmo ponto de corte do `md:` do Tailwind usado
// no resto do módulo (ver app/expedicao/layout.js).
export function usarEhCelular() {
  const [ehCelular, setEhCelular] = useState(false);
  useEffect(() => {
    const atualizar = () => setEhCelular(window.innerWidth < 768);
    atualizar();
    window.addEventListener("resize", atualizar);
    return () => window.removeEventListener("resize", atualizar);
  }, []);
  return ehCelular;
}
