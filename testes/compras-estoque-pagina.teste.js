// ⚠⚠ A TELA COMPRAS › ESTOQUE › CATÁLOGO OMIE CORTAVA EM 1.000 ANTES DE FILTRAR. Medido em 25/09/2026:
// 2.500 produtos ativos, `take: 1000` em ordem alfabética — o último a chegar era "INDUSDUR HB PR 90…".
// A busca e os filtros rodam no NAVEGADOR, sobre esses 1.000: 419 dos 657 produtos com posição no Omie
// — TODOS os 196 PERFIL e 52 TUBO — nunca apareciam, nem procurando pelo nome. Corrigir a sincronização
// sem isto deixaria o aço fora da tela do mesmo jeito. Mesma lição de
// docs/memoria-claude/torg_filtro_antes_do_corte.md.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));

import { carregarCatalogoOmie } from "@/lib/estoque-catalogo";

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.estoqueItem.findMany.mockResolvedValue([]);
  mockPrisma.configEstoque.findFirst.mockResolvedValue(null);
});

describe("Compras › Estoque — o que a página carrega", () => {
  // Quebra que pega: qualquer `take` na consulta — com o filtro no navegador, o corte é invisível.
  it("⚠⚠ pede ao banco TODOS os produtos ativos, sem corte", async () => {
    await carregarCatalogoOmie();
    const [consulta] = mockPrisma.estoqueItem.findMany.mock.calls[0];
    expect(consulta.where).toEqual({ ativo: true });
    expect(consulta).not.toHaveProperty("take");
  });

  // Quebra que pega: tirar do `select` um campo que a tela lê — a coluna sairia vazia sem erro.
  it("traz os campos que a tela usa, inclusive o detalhe por local", async () => {
    await carregarCatalogoOmie();
    const [consulta] = mockPrisma.estoqueItem.findMany.mock.calls[0];
    for (const campo of ["id", "codigoOmie", "descricao", "categoriaOmie", "categoriaLabel", "unidade", "cmc", "qtdAtual", "locaisQtd", "ultimaSincOmie"]) {
      expect(consulta.select?.[campo]).toBe(true);
    }
  });

  it("sem configuração gravada, a tela recebe a padrão — não `null`", async () => {
    const { config } = await carregarCatalogoOmie();
    expect(config).toMatchObject({ ultimaSincProd: null, ultimaSincMov: null });
  });

  it("entrega à tela a agenda dos crons do estoque, lida do vercel.json", async () => {
    const { agendaCron } = await carregarCatalogoOmie();
    expect(agendaCron.produtos).toMatch(/^de hora em hora/);
    expect(agendaCron.movimentacoes).toMatch(/^de hora em hora/);
  });
});
