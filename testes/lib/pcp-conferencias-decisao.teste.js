import { beforeEach, it, expect, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/material-liberacao", () => ({
  analisarMaterial: vi.fn(),
  pecasLiberaveis: (pecas, porPeca) =>
    pecas.filter((p) => {
      const m = porPeca.get(p.id);
      return m?.estado === "NA_OP" || (m?.estado === "ESTOQUE" && m.rInformado);
    }),
}));
vi.mock("@/lib/pasta-engenharia", () => ({
  portaoDoDesenho: vi.fn(),
  temDesenhoNaPasta: (p, m) => !p.semDesenho.has(m),
  temMaquinaNaPasta: (p, m) => (p.maquinaMedida ? !p.semMaquina.has(m) : null),
}));
import { analisarMaterial } from "@/lib/material-liberacao";
import { portaoDoDesenho } from "@/lib/pasta-engenharia";
import { conferirDecisaoPcp } from "@/lib/pcp-conferencias-decisao";
const p = {
  fonte: "LPC_IMPORT",
  id: "p",
  marca: "P1",
  qte: 5,
  programacao: { situacao: "PROGRAMADA", qtdOk: true },
};
const conferir = () =>
  conferirDecisaoPcp({
    opId: "op",
    opNumero: "112",
    setor: "CORTE",
    pecas: [p],
    todas: [p, { id: "croqui" }],
    dadosCompletos: true,
  });
beforeEach(() => {
  analisarMaterial.mockResolvedValue({
    porPeca: new Map([["p", { estado: "NA_OP", rs: ["R42"] }]]),
  });
  portaoDoDesenho.mockResolvedValue({
    confiavel: true,
    checadoEm: "2026-09-12T12:00:00Z",
    maquinaMedida: true,
    semDesenho: new Set(),
    semMaquina: new Set(),
  });
});
it("reaproveita conferências e passa as peças da OP para herança de R dos croquis", async () => {
  const j = await conferir();
  expect(j.porId.p.estado).toBe("LIBERAR");
  expect(j.porId.p.rs).toEqual(["R42"]);
  expect(analisarMaterial.mock.calls.at(-1)[1]).toHaveLength(2);
});
it("estoque sem R escolhido bloqueia a recomendação", async () => {
  analisarMaterial.mockResolvedValue({
    porPeca: new Map([
      ["p", { estado: "ESTOQUE", rs: ["R42"], rInformado: null }],
    ]),
  });
  expect((await conferir()).porId.p.estado).toBe("PENDENTE");
});
it("falhas de material e pasta são pendências, nunca sucesso vazio", async () => {
  analisarMaterial.mockRejectedValue(new Error("CMR indisponível"));
  portaoDoDesenho.mockRejectedValue(new Error("pasta indisponível"));
  const j = await conferir();
  expect(j.incompleta).toBe(true);
  expect(j.porId.p.estado).toBe("PENDENTE");
});
it("conferência antiga ou truncada não comprova arquivos das marcas atuais", async () => {
  portaoDoDesenho.mockResolvedValue({
    confiavel: false,
    semDesenho: new Set(),
  });
  expect((await conferir()).porId.p.motivos).toContain(
    "Reconferir pasta da Engenharia",
  );
});
it("CMR sem número R não comprova rastreabilidade para corte", async () => {
  analisarMaterial.mockResolvedValue({
    porPeca: new Map([["p", { estado: "NA_OP", rs: [] }]]),
  });
  expect((await conferir()).porId.p.estado).toBe("PENDENTE");
});

it("marca exclusiva da LE não herda cobertura da conferência feita sobre a LPC", async () => {
  const j = await conferirDecisaoPcp({
    opId: "op",
    opNumero: "112",
    setor: "CORTE",
    pecas: [{ ...p, fonte: "LE_IMPORT" }],
    todas: [p],
    dadosCompletos: true,
  });
  expect(j.porId.p.estado).toBe("PENDENTE");
});
