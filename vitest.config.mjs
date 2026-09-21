import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Base de testes do portal.
//
// ⚠ POR QUE ISTO EXISTE. O repositório não tinha teste nenhum, e o
// desenvolvimento local roda contra o banco de PRODUÇÃO (ver CLAUDE.md). Isso
// significa que a única rede de segurança pra refatorar era o `next build`, que
// só pega erro de sintaxe e import — nunca uma conta que passou a dar outro
// número.
//
// ⚠ NENHUM TESTE TOCA O BANCO. O Prisma é mockado em testes/apoio/prisma.js.
// Um teste que abre conexão com o Neon é um teste que escreve em produção.
export default defineConfig({
  // ⚠⚠ JSX AUTOMÁTICO, COMO O NEXT COMPILA. No transform clássico (o padrão do esbuild sem
  // tsconfig) o JSX vira `React.createElement`/`React.Fragment`, e componente que não importa
  // `React` — a maioria deles, porque o Next não exige — estoura "React is not defined" só dentro
  // do teste. Pegou o `CampoData` em 16/09/2026: a tela funcionava, o teste não subia.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["testes/**/*.teste.{js,jsx}"],
    setupFiles: ["testes/apoio/setup.js"],
    coverage: {
      provider: "v8",
      include: ["lib/**/*.js"],
      exclude: ["lib/**/*-pdf.js", "lib/generated/**"],
      reporter: ["text-summary", "html"],
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      // ver testes/apoio/server-only.js
      "server-only": fileURLToPath(new URL("./testes/apoio/server-only.js", import.meta.url)),
    },
  },
});
