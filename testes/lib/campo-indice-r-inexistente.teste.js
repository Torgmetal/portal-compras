// ⚠⚠ `indiceR` NÃO É CAMPO DE NENHUM MODELO — o R do CMR mora em `DocumentoQualidade.importRef`.
// Selecionado num `findMany`, o Prisma lança PrismaClientValidationError, e como o Prisma é mockado
// nos testes isso nunca aparecia aqui: a busca de certificados dos recebimentos devolvia corpo vazio
// ("Unexpected end of JSON input", 14/10/2026). `indiceR` continua existindo como nome de variável e
// de coluna da PLANILHA (lib/cmr*.js) — o que não pode é ir para um `select`.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function arquivos(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? arquivos(p) : /\.(js|jsx)$/.test(n) ? [p] : [];
  });
}

describe("indiceR não vai para select do Prisma", () => {
  it("o schema não tem o campo", () => {
    expect(readFileSync("prisma/schema.prisma", "utf8")).not.toMatch(/\bindiceR\b/);
  });
  it("nenhuma rota ou lib seleciona indiceR", () => {
    const culpados = [...arquivos("app"), ...arquivos("lib")].filter((f) => /\bindiceR:\s*true\b/.test(readFileSync(f, "utf8")));
    expect(culpados).toEqual([]);
  });
});
