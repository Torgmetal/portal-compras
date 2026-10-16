// O app Torg Engenharia (no PC do projetista) não tem sessão do portal: o portão e o pareamento autenticam por token
// próprio e precisam passar pelo middleware. O VINCULAR, não — é o projetista logado quem prende o código à conta.
// ⚠ Teste de texto, como o do portal do fornecedor: importar o middleware puxa o runtime de edge do next-auth.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const fonte = readFileSync(new URL("../middleware.js", import.meta.url), "utf8");
const exatos = [...fonte.matchAll(/path === "([^"]+)"/g)].map((m) => m[1]);
const prefixos = [...fonte.matchAll(/path\.startsWith\("([^"]+)"\)/g)].map((m) => m[1]).filter((p) => p.startsWith("/api/") && p !== "/api/");
const liberado = (path) => exatos.includes(path) || prefixos.some((p) => path.startsWith(p));

describe("middleware — portão de IA da Engenharia", () => {
  it("as rotas que o app chama sem sessão passam", () => {
    for (const p of ["/api/engenharia-ia/aparelho/iniciar", "/api/engenharia-ia/aparelho/status", "/api/engenharia-ia/v1/messages", "/api/engenharia-ia/v1/messages/count_tokens"]) {
      expect(liberado(p), p).toBe(true);
    }
  });
  it("vincular e a administração continuam exigindo login", () => {
    for (const p of ["/api/engenharia-ia/aparelho/vincular", "/api/admin/engenharia-ia/limite", "/api/admin/engenharia-ia/aparelho/x"]) {
      expect(liberado(p), p).toBe(false);
    }
  });
});
