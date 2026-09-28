// O portal do fornecedor (`app/fornecedores/`) é público: quem abre o link não tem login.
// Toda API que ele chama precisa estar na allowlist do `middleware.js` — senão o middleware
// redireciona para o /entrar, o fetch recebe HTML e o fornecedor vê "Erro 200 do servidor".
// Foi assim que o "Não vou cotar (declinar)" nunca funcionou (28/09/2026: 0 declínios gravados
// desde que o botão existe; a FERALVAREZ foi a primeira a reclamar).
//
// ⚠ TESTE DE TEXTO, pelo mesmo motivo do de crons (cron-agenda.teste.js): importar o middleware
// puxa o runtime de edge do next-auth. Aqui basta garantir que nenhum caminho fique de fora.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const raiz = new URL("../", import.meta.url).pathname;
const fonteMiddleware = readFileSync(join(raiz, "middleware.js"), "utf8");

function arquivos(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? arquivos(p) : /\.(jsx?|mjs)$/.test(n) ? [p] : [];
  });
}

/** Os caminhos de API que as telas públicas chamam, cortados antes da parte dinâmica (`${…}`). */
function apisChamadas() {
  const achados = new Set();
  for (const f of arquivos(join(raiz, "app/fornecedores"))) {
    for (const m of readFileSync(f, "utf8").matchAll(/fetch\(\s*[`"'](\/api\/[^`"'$?]*)/g)) achados.add(m[1]);
  }
  return [...achados].sort();
}

const liberado = (path) => {
  const prefixos = [...fonteMiddleware.matchAll(/path\.startsWith\("([^"]+)"\)/g)].map((m) => m[1]);
  const exatos = [...fonteMiddleware.matchAll(/path === "([^"]+)"/g)].map((m) => m[1]);
  // ⚠ O `/api/` puro aparece no middleware só para escolher JSON em vez de redirect — não libera nada.
  return exatos.includes(path) || prefixos.some((p) => p.startsWith("/api/") && p !== "/api/" && path.startsWith(p));
};

describe("middleware — o portal do fornecedor alcança as APIs que chama", () => {
  const apis = apisChamadas();

  it("acha as chamadas (o teste não passa por estar olhando para o nada)", () => {
    expect(apis).toContain("/api/cotacao/submeter/");
    expect(apis).toContain("/api/cotacao/declinar/");
  });

  it.each(apis)("%s passa sem login", (path) => {
    expect(liberado(path)).toBe(true);
  });
});
