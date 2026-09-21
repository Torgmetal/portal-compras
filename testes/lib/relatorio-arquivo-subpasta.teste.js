// Onde o PDF do relatório de inspeção é guardado na pasta da obra (lib/relatorio-arquivo).
//
// ⚠ A OP-089 tem "3. Relatórios de Inspeção" com subpastas por tipo ("3.1 Relatório de
// Pintura"…); gravar na raiz fazia a Qualidade mover o arquivo à mão e o link do banco morrer
// (15/09/2026). A regra: usar a pasta que JÁ existe, no nível que existir — nunca criar.
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ listar: vi.fn() }));
vi.mock("@/lib/sharepoint", () => ({ listChildrenByPath: mocks.listar, uploadFileToFolder: vi.fn(), acharPastaOp: vi.fn(), getAccessToken: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/relatorio-dimensional", () => ({ baixarDesenho: vi.fn() }));
vi.mock("@/lib/relatorio-render", () => ({ gerarPDFdoRelatorio: vi.fn() }));

import { subpastaDeRelatorios } from "@/lib/relatorio-arquivo";

const pasta = (name) => ({ name, folder: {} });
const arquivo = (name) => ({ name });
const arvore = (mapa) => mocks.listar.mockImplementation(async (_drive, caminho) => mapa[caminho] || []);
const Q = "/OP/8. Qualidade";
const RAIZ = "3. Relatórios de Inspeção";

describe("subpastaDeRelatorios — em qual pasta da obra o PDF entra", () => {
  beforeEach(() => mocks.listar.mockReset());

  it("molde novo com subpasta por tipo: grava dentro dela (OP-089)", async () => {
    arvore({
      [Q]: [pasta("1. PIT"), pasta("2. PLP"), pasta(RAIZ)],
      [`${Q}/${RAIZ}`]: [pasta("3.1 Relatório de Pintura"), pasta("3.2 DM - Dimensional"), pasta("3.3 EVS - Ensaio Visual de Solda"), pasta("3.4 LP - Líquido Penetrante"), pasta("Obsoleto"), arquivo("RIP-089-002 - Inspeção de pintura.pdf")],
    });
    expect(await subpastaDeRelatorios("d", Q, "PINTURA")).toBe(`${RAIZ}/3.1 Relatório de Pintura`);
    expect(await subpastaDeRelatorios("d", Q, "DIMENSIONAL")).toBe(`${RAIZ}/3.2 DM - Dimensional`);
    expect(await subpastaDeRelatorios("d", Q, "PRE_MONTAGEM")).toBe(`${RAIZ}/3.2 DM - Dimensional`);
    expect(await subpastaDeRelatorios("d", Q, "VISUAL_SOLDA")).toBe(`${RAIZ}/3.3 EVS - Ensaio Visual de Solda`);
    expect(await subpastaDeRelatorios("d", Q, "LP")).toBe(`${RAIZ}/3.4 LP - Líquido Penetrante`);
  });

  it("molde novo sem a subpasta do tipo: fica na raiz da pasta de relatórios, sem criar nada", async () => {
    arvore({ [Q]: [pasta(RAIZ)], [`${Q}/${RAIZ}`]: [pasta("Obsoleto"), pasta("3.1 Relatório de Pintura")] });
    expect(await subpastaDeRelatorios("d", Q, "ULTRASSOM")).toBe(RAIZ);
  });

  it("molde antigo (OP-067): a pasta do tipo, no nível da Qualidade", async () => {
    arvore({ [Q]: [pasta("Relatório Dimensional"), pasta("Relatórios de Pintura"), pasta("Relatórios de US")] });
    expect(await subpastaDeRelatorios("d", Q, "PINTURA")).toBe("Relatórios de Pintura");
    expect(await subpastaDeRelatorios("d", Q, "ULTRASSOM")).toBe("Relatórios de US");
    expect(await subpastaDeRelatorios("d", Q, "PRE_MONTAGEM")).toBe("Relatório Dimensional");
  });

  it("obra sem pasta nenhuma: a padrão", async () => {
    arvore({});
    expect(await subpastaDeRelatorios("d", Q, "PINTURA")).toBe(RAIZ);
  });
});
