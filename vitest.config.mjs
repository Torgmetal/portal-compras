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
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
});
