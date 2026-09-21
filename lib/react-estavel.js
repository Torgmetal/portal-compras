"use client";
// Dá identidade ESTÁVEL a um componente definido DENTRO de outro componente.
//
// ⚠⚠ O DEFEITO QUE ISTO CONSERTA: "clicar número por número". Vitor (14/09/2026), sobre o relatório de
// pintura: "alguns campos estamos tendo que clicar número por número, um deles é no lote da tinta".
// `const Campo = (props) => <input …/>` escrito dentro do componente-pai é uma FUNÇÃO NOVA a cada render;
// para o React, função nova = componente de outro tipo, então a cada tecla ele DESMONTA o <input> e monta
// outro no lugar — o foco se perde e quem digita tem de clicar de novo para cada caractere. Seis
// formulários da Qualidade (pintura da bancada e do campo, US, LP, EVS, PLP) tinham isso.
//
// A função de desenho continua sendo escrita dentro do pai (ela fecha sobre `res`, `travado`, …), mas o
// COMPONENTE devolvido nasce uma vez só por montagem e lê sempre a versão mais nova da função por um ref.
import { useRef, useState } from "react";

/**
 * @template P
 * @param {(props: P) => import("react").ReactNode} render  a função de desenho (pode fechar sobre o estado do pai)
 * @returns {(props: P) => import("react").ReactNode}  componente com identidade estável
 */
export function useComponenteEstavel(render) {
  const ref = useRef(render);
  ref.current = render;
  const [Comp] = useState(() => function Estavel(props) { return ref.current(props); });
  return Comp;
}
