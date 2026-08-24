// Caça identificador usado e não importado — o erro que o `next build` NÃO pega.
//
// ⚠⚠ POR QUE ISTO EXISTE.
// `next build` compila com sucesso um arquivo que usa uma função que ninguém importou. O erro só
// aparece quando alguém clica no botão, em produção. Já aconteceu três vezes, e as três nasceram do
// mesmo movimento: mover uma função para um lib compartilhado e trocar a chamada local pela nova
// sem levar o import junto.
//
//   f6ce3cc8 (22/08/2026)  `gerarPDFdoRelatorio` — o PDF do relatório de inspeção quebrava a tela
//                          da Qualidade. Ironia: é o commit que centralizou o despacho para
//                          consertar o link de assinatura, e consertou a rota pública quebrando a
//                          interna.
//   f835c2ff (20/08/2026)  `sincronizarCronogramaSyneco` / `avancosDasTarefas` — pior, porque o
//                          `try/catch` engolia o ReferenceError: a lista de cronogramas saía sem
//                          avanço nenhum, como se a fábrica não tivesse produzido, sem erro na tela.
//   1dfacd3d (24/08/2026)  `OP_VIVA` — a fila de corte.
//
// Rodar antes de subir:
//
//   npm run checar
//
// ⚠ SÓ `no-undef`, de propósito. Não é para virar régua de estilo — é para pegar a classe de erro
// que passa pelo build e cai na mão de quem está usando o portal.
const navegador = [
  "window", "document", "console", "fetch", "navigator", "location", "history", "localStorage",
  "sessionStorage", "alert", "confirm", "prompt", "setTimeout", "clearTimeout", "setInterval",
  "clearInterval", "requestAnimationFrame", "cancelAnimationFrame", "queueMicrotask",
  "Blob", "File", "FileReader", "FormData", "Image", "URL", "URLSearchParams", "Headers",
  "Response", "Request", "AbortController", "AbortSignal", "WebSocket", "EventSource",
  "ResizeObserver", "IntersectionObserver", "MutationObserver", "getComputedStyle",
  "DOMParser", "XMLHttpRequest", "HTMLElement", "Event", "CustomEvent", "performance",
  "atob", "btoa", "TextEncoder", "TextDecoder", "ReadableStream", "TransformStream",
  "crypto", "structuredClone", "self", "globalThis", "React",
];
const node = ["process", "Buffer", "module", "require", "__dirname", "__filename"];

// ⚠ o código tem `eslint-disable` apontando para regras do Next e do react-hooks. Sem os plugins
// carregados, cada um desses comentários vira um erro "Definition for rule not found" — 28 deles,
// que afogariam o punhado de achados que importa. Os stubs abaixo existem só para que os comentários
// resolvam; nenhuma regra é de fato aplicada.
const stub = { rules: { "no-img-element": { create: () => ({}) }, "exhaustive-deps": { create: () => ({}) } } };

export default [
  {
    files: ["**/*.js", "**/*.jsx", "**/*.mjs"],
    plugins: { "@next/next": stub, "react-hooks": stub },
    linterOptions: { reportUnusedDisableDirectives: "off" },
    ignores: ["node_modules/**", ".next/**", "public/**", "lib/_*_*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: Object.fromEntries([...navegador, ...node].map((g) => [g, "readonly"])),
    },
    rules: { "no-undef": "error" },
  },
];
