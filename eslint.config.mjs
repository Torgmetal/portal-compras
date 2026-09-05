// Quality gates do portal — tier rápido (sem informação de tipos).
//
// Três regras próprias, em ./eslint-rules/ (copiadas do vibe-coding-toolkit,
// não reescritas):
//   quality/max-lines            — teto de 350 linhas por arquivo
//   quality/no-direct-console    — console.* direto
//   quality/no-direct-data-access — camada de apresentação importando o Prisma
//
// Complementa (não substitui) o `npm run checar`, que é só `no-undef` e roda
// sem dependência instalada. Aqui rodamos com o eslint do projeto.
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";

import reactPlugin from "eslint-plugin-react";

import quality from "./eslint-rules/index.cjs";

// ⚠ O código tem ~43 comentários `eslint-disable` apontando para regras do
// @next/next e do react-hooks. Sem os plugins carregados, cada um vira um erro
// "Definition for rule not found" — ruído puro que afoga os achados reais.
// Stubs só para que os comentários resolvam; nenhuma regra é de fato aplicada.
// Mesma solução do eslint.undef.config.mjs.
const stub = {
  rules: new Proxy({}, { get: () => ({ create: () => ({}) }), has: () => true }),
};

// O portal roda em três runtimes (browser, Node/serverless, edge) e não usa o
// pacote `globals`. Mesma lista do eslint.undef.config.mjs, que é a que o
// código de fato usa.
const navegador = [
  "window", "document", "console", "fetch", "navigator", "location", "history",
  "localStorage", "sessionStorage", "alert", "confirm", "prompt", "setTimeout",
  "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame",
  "cancelAnimationFrame", "queueMicrotask", "Blob", "File", "FileReader",
  "FormData", "Image", "URL", "URLSearchParams", "Headers", "Response",
  "Request", "AbortController", "AbortSignal", "WebSocket", "EventSource",
  "ResizeObserver", "IntersectionObserver", "MutationObserver",
  "getComputedStyle", "DOMParser", "XMLHttpRequest", "HTMLElement", "Event",
  "CustomEvent", "performance", "atob", "btoa", "TextEncoder", "TextDecoder",
  "ReadableStream", "TransformStream", "crypto", "structuredClone", "self",
  "globalThis", "React",
];
const node = ["process", "Buffer", "module", "require", "__dirname", "__filename"];

export default defineConfig([
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: Object.fromEntries(
        [...navegador, ...node].map((g) => [g, "readonly"])
      ),
    },
    plugins: { "@next/next": stub, "react-hooks": stub },
    linterOptions: { reportUnusedDisableDirectives: "off" },
  },
  js.configs.recommended,
  {
    // ⚠ NÃO é o preset do react — é UMA regra. Sem `react/jsx-uses-vars`, o
    // no-unused-vars não enxerga `<Componente />` como uso e reporta todo
    // componente importado como órfão. Sem isso a medição mente.
    plugins: { react: reactPlugin },
    rules: { "react/jsx-uses-vars": "error" },
  },
  {
    // Regras do preset recommended que já têm dívida. Mesma política: "warn"
    // com a contagem anotada, promover a "error" quando zerar.
    rules: {
      "no-useless-escape": "warn", // baseline: 32
      "prefer-const": "warn", // baseline: 26
      "no-control-regex": "warn", // baseline: 16
      "no-irregular-whitespace": "warn", // baseline: 5
      "no-dupe-keys": "warn", // baseline: 3 — são bugs reais, prioridade no burndown
      "no-unused-vars": "warn", // baseline: 4292
      "no-empty": "warn", // baseline: 2
      "no-case-declarations": "warn", // baseline: 1
    },
  },

  // Presets de framework ficam de fora de propósito. O @next/next e o
  // react-hooks entrariam como bloco próprio, com subconjunto curado — não
  // como preset inteiro. Enquanto isso, `npm run checar` cobre o no-undef e
  // o componente-em-JSX-sem-import.

  {
    // A aplicação é app/ + lib/ + components/. scripts/ e prisma/ são
    // ferramentaria de linha de comando, não o produto — ficam fora.
    files: ["{app,lib,components}/**/*.{js,jsx,mjs,cjs}"],
    plugins: { quality },
    rules: {
      "no-empty": ["warn", { allowEmptyCatch: true }], // baseline: 2
      "no-var": "error", // zero violações
      "prefer-const": "warn", // baseline: 26
      "no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Orçamento de tamanho e complexidade: tudo "warn" de propósito. São
      // números para começar conversa sobre fatoração, não portão.
      complexity: ["warn", 12],
      "max-depth": ["warn", 4],
      "max-statements": ["warn", 20],
      "max-params": ["warn", 4],
      "max-lines-per-function": [
        "warn",
        { max: 150, skipBlankLines: true, skipComments: true },
      ],
      "max-nested-callbacks": ["warn", 3],

      // ── Severidades definidas pela medição de 05/09/2026, não por gosto.
      // Regra com violação nasce em "warn" com a contagem como linha de base;
      // quando a contagem chegar a zero, ela volta para "error".
      "quality/max-lines": ["warn", { max: 350 }], // baseline: 175 arquivos
      "quality/no-direct-console": [
        "warn", // baseline: 212 ocorrências
        { logger: "um adaptador de log do projeto" },
      ],
      "quality/no-direct-data-access": [
        "warn", // baseline: 39 imports
        {
          modules: ["@/lib/prisma", "@/lib/prisma.js", "./prisma", "./prisma.js"],
          bindings: ["prisma", "prismaDirect"],
          layers: ["/app/", "/components/"],
          // Sem `extensions`: aqui componente é .js tanto quanto rota de API,
          // então a extensão não distingue camada nenhuma.
        },
      ],
    },
  },
  {
    // As rotas de API SÃO a camada de dados — é lá que o Prisma deve ser
    // usado. Este bloco vem DEPOIS do que liga a regra: no flat config, para
    // um arquivo que casa com os dois, vale o último.
    files: ["app/api/**/*.js"],
    rules: {
      "quality/no-direct-data-access": "off",
    },
  },
  {
    // O próprio módulo do Prisma e o adaptador de log. Mesmo motivo de ordem.
    files: ["lib/prisma.js"],
    rules: {
      "quality/no-direct-console": "off",
    },
  },
  {
    files: ["eslint-rules/**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { module: "readonly", require: "readonly" },
    },
  },
  globalIgnores([
    ".claude/**",
    ".next/**",
    "node_modules/**",
    "public/**",
    "dist/**",
    "build/**",
    "coverage/**",
    "package-lock.json",
    "lib/_*_*.mjs",
    "lib/generated/**",
  ]),
]);
