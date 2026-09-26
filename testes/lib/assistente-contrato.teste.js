import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));

import { TODAS_TOOLS, getToolsParaUser } from "@/lib/assistente/tools";
import { buildSystemPrompt } from "@/lib/assistente/system-prompt";
import { modeloForcadoDe } from "@/lib/assistente/modelo";
import { executarTool } from "@/lib/assistente/executar-tools";

// O que o Torguinho lê sobre as ferramentas é o contrato delas: status que não existe no banco vira
// consulta que o Prisma recusa, e ferramenta citada no prompt que o usuário não tem vira chamada
// que não acontece.

const schemaPrisma = readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");
const enumDoBanco = (nome) =>
  schemaPrisma.match(new RegExp(`enum ${nome} \\{([\\s\\S]*?)\\}`))[1]
    .split("\n").map((l) => l.replace(/\/\/.*$/, "").trim()).filter(Boolean);
const ferramenta = (nome) => TODAS_TOOLS.find((t) => t.name === nome);

describe("contrato das ferramentas do Torguinho", () => {
  it("o status oferecido para OP é o do enum do banco", () => {
    expect(ferramenta("consultar_ops").input_schema.properties.status.enum).toEqual(enumDoBanco("OPStatus"));
  });

  it("o exemplo de consulta genérica não filtra por um status que a tarefa de cronograma não tem", () => {
    expect(ferramenta("consultar_dados").description).not.toMatch(/status: 'ATRASADA'/);
  });

  it("o prompt não cita ferramenta que o perfil do usuário não recebe", () => {
    const nomes = TODAS_TOOLS.map((t) => t.name);
    for (const modulos of [["COMERCIAL"], ["EXPEDICAO"], ["QUALIDADE"], ["RH"], ["COMPRAS"], []]) {
      const user = { name: "Fulano de Tal", tipo: "USUARIO", modulos };
      const recebe = getToolsParaUser(user).map((t) => t.name);
      const citadas = nomes.filter((n) => buildSystemPrompt(user).includes(n));
      expect(citadas.filter((n) => !recebe.includes(n)), `módulos: ${modulos.join(",") || "nenhum"}`).toEqual([]);
    }
  });
});

describe("modelo do Torguinho", () => {
  it('"auto" ou vazio deixam a rota escolher por pergunta; outro valor fixa o modelo', () => {
    expect(modeloForcadoDe({ modelo: "auto" })).toBeNull();
    expect(modeloForcadoDe({ modelo: "" })).toBeNull();
    expect(modeloForcadoDe(null)).toBeNull();
    expect(modeloForcadoDe({ modelo: "claude-haiku-4-5" })).toBe("claude-haiku-4-5");
  });
});

describe("peso produzido pelo MES", () => {
  const grupo = (obra, setor, kg) => ({ obra, setor, _sum: { produzidoKg: kg, produzidoUn: 1 }, _count: { productionId: 1 } });
  const ADMIN = { id: "u1", name: "Admin", tipo: "ADMIN", modulos: [] };

  it("é o kg do setor mais avançado com apontamento — nunca a soma dos setores", async () => {
    mockPrisma.mesApontamento.groupBy.mockResolvedValue([
      grupo("T97", "Corte", 5000), grupo("T97", "Pintura", 3000), grupo("T97", "Montagem", 4500), grupo("T97", "Jato", 3200),
    ]);
    mockPrisma.mesApontamento.count.mockResolvedValue(4);
    const r = await executarTool("consultar_mes_producao", { obra: "T97" }, ADMIN);
    expect(r.obras[0]).toMatchObject({ obra: "T97", pesoProduzidoKg: 3000, setorReferencia: "Pintura" });
    expect(r.obras[0]).not.toHaveProperty("totalKg");
    expect(r.obras[0].setores.map((s) => s.setor)).toEqual(["Corte", "Montagem", "Jato", "Pintura"]);
  });

  it("obra que só passou pelo corte tem o corte como referência", async () => {
    mockPrisma.mesApontamento.groupBy.mockResolvedValue([grupo("T112", "Corte", 1200)]);
    mockPrisma.mesApontamento.count.mockResolvedValue(1);
    const r = await executarTool("consultar_mes_producao", { obra: "T112" }, ADMIN);
    expect(r.obras[0]).toMatchObject({ pesoProduzidoKg: 1200, setorReferencia: "Corte" });
  });
});
