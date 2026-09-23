import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: vi.fn().mockResolvedValue({ id: "u", name: "Alexandre Stival" }) }));
import { PATCH } from "@/app/api/campo/relatorios/[id]/route";
import { CAMPOS_CONDICAO_CAMPO } from "@/lib/campo-condicoes";

// "ESTÁ SUMINDO ALGUMAS INFORMAÇÕES QUE ELA COLOCOU" (Vitor, 23/09/2026). A rota do celular reconstrói
// cada linha pela lista do que o campo pode escrever — e o que não está na lista some na gravação.

let rel;
const patch = (corpo) =>
  PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify(corpo) }), { params: { id: "r" } });

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.relatorioInspecao.findUnique.mockImplementation(async () => rel);
  mockPrisma.relatorioInspecao.update.mockImplementation(async ({ data }) => (rel = { ...rel, ...data }));
  mockPrisma.auditLog.create.mockResolvedValue({});
});

describe("líquido penetrante: a indicação da junta", () => {
  beforeEach(() => {
    rel = {
      id: "r", tipo: "LP", marcas: ["T102B45"], equipamentos: [], resultados: {},
      linhas: [{ marca: "T102B45", descricao: "SE-033", indicacaoLp: "", local: "", tamanho: "", tipoDefeito: "", laudo: "" }],
    };
  });

  it("nº da indicação, local, tamanho e tipo digitados no celular ficam gravados", async () => {
    const r = await patch({ medidas: [{ i: 0, marca: "T102B45", indicacaoLp: "1", local: "raiz da solda", tamanho: "3", tipoDefeito: "IL", laudo: "R", obs: null }] });
    expect(r.status).toBe(200);
    expect(rel.linhas[0]).toMatchObject({ indicacaoLp: "1", local: "raiz da solda", tamanho: "3", tipoDefeito: "IL", laudo: "R", descricao: "SE-033" });
  });

  it("a peça acrescentada no celular também leva a indicação", async () => {
    await patch({ medidas: [{ i: 1, marca: "T102B46", indicacaoLp: "2", local: "chapa", tamanho: "1", tipoDefeito: "INR", laudo: "A" }] });
    expect(rel.linhas).toHaveLength(2);
    expect(rel.linhas[1]).toMatchObject({ marca: "T102B46", indicacaoLp: "2", local: "chapa", tamanho: "1", tipoDefeito: "INR", laudo: "A" });
  });

  it("mesmos tetos do computador: número 20, local 60, tamanho 30, tipo 10", async () => {
    await patch({ medidas: [{ i: 0, indicacaoLp: "9".repeat(50), local: "x".repeat(99), tamanho: "5".repeat(50), tipoDefeito: "Y".repeat(30) }] });
    const l = rel.linhas[0];
    expect([l.indicacaoLp.length, l.local.length, l.tamanho.length, l.tipoDefeito.length]).toEqual([20, 60, 30, 10]);
  });
});

describe("a lixeira do celular", () => {
  beforeEach(() => {
    rel = {
      id: "r", tipo: "VISUAL_SOLDA", marcas: ["T1", "T2", "T3"], equipamentos: [], resultados: {},
      linhas: [
        { marca: "T1", laudo: "A", soldador: "Ana" },
        { marca: "T2", laudo: "R", soldador: "Bia", descontinuidade: "TR" },
        { marca: "T3", laudo: "A", soldador: "Caio" },
      ],
    };
  });

  it("apaga a junta pedida e cada outra segue com os SEUS dados", async () => {
    const r = await patch({
      medidas: [{ i: 1, marca: "T2", laudo: "R", soldador: "Bia" }, { i: 2, marca: "T3", laudo: "A", soldador: "Caio" }],
      removidas: [{ i: 0, marca: "T1" }],
    });
    expect(r.status).toBe(200);
    expect(rel.linhas.map((l) => [l.marca, l.laudo, l.soldador])).toEqual([["T2", "R", "Bia"], ["T3", "A", "Caio"]]);
  });

  it("não apaga às cegas: se a marca naquela posição mudou, a linha fica", async () => {
    // alguém reordenou no computador enquanto o celular estava aberto — a posição 0 já não é a T1
    await patch({ medidas: [], removidas: [{ i: 0, marca: "T9" }] });
    expect(rel.linhas.map((l) => l.marca)).toEqual(["T1", "T2", "T3"]);
  });

  it("junta nova entra no fim, na ordem, sem buraco — mesmo com índice alto", async () => {
    await patch({
      medidas: [{ i: 7, marca: "T8", laudo: "A" }, { i: 5, marca: "T6", laudo: "A" }],
      removidas: [{ i: 1, marca: "T2" }],
    });
    expect(rel.linhas.map((l) => l.marca)).toEqual(["T1", "T3", "T6", "T8"]);
    expect(rel.linhas.every(Boolean)).toBe(true);
  });

  it("no dimensional a lixeira não vale — as cotas vêm do desenho, no computador", async () => {
    rel = { ...rel, tipo: "DIMENSIONAL", linhas: [{ letra: "A", marca: "T1", projetoMm: 100 }, { letra: "B", marca: "T1", projetoMm: 50 }] };
    await patch({ medidas: [], removidas: [{ i: 0, marca: "T1" }] });
    expect(rel.linhas.map((l) => l.letra)).toEqual(["A", "B"]);
  });

  it("a auditoria diz quantas juntas o celular apagou", async () => {
    await patch({ medidas: [], removidas: [{ i: 0, marca: "T1" }] });
    const diff = mockPrisma.auditLog.create.mock.calls.at(-1)[0].data.diff;
    expect(diff).toMatchObject({ removidas: ["T1"] });
  });
});

it("todo campo que a tela do celular carrega, a rota grava — senão ele voltaria em branco", async () => {
  rel = { id: "r", tipo: "ULTRASSOM", marcas: ["P1"], linhas: [], equipamentos: [], resultados: {} };
  const condicoes = Object.fromEntries(CAMPOS_CONDICAO_CAMPO.map((k, n) => [k, `v${n}`]));
  const r = await patch({ condicoes });
  expect(r.status).toBe(200);
  const perdidos = CAMPOS_CONDICAO_CAMPO.filter((k) => rel.resultados[k] !== condicoes[k]);
  expect(perdidos).toEqual([]);
});
