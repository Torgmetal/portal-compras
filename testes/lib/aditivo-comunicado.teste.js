// Comunicado de Aditivo: PDF padrão Torg e e-mail com o marcador do aceite (16/09/2026).
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/kickoff-email", () => ({ urlBase: () => "https://workspace.torg.com.br", blocoAceite: (u) => `<a href="${u}">aceitar</a>` }));

import { gerarComunicadoAditivoPDF, montarEmailAditivo, PROVIDENCIAS } from "@/lib/aditivo-comunicado";

const dados = {
  ad: {
    id: "ad1", numero: 2, status: "RASCUNHO", descricao: "Longarinas adicionais do TC 8011 — 12 t.\nInclui pintura.", dataInicio: "2026-09-14", dataFimPrevista: "2026-11-10",
    orcamentoRef: "313-26", createdAt: new Date(), createdBy: { name: "Vitor" },
    itens: [{ categoria: "MATERIA_PRIMA", descricao: "Perfis W", unidade: "kg", qtdContratada: 12000 }],
    receitas: [{ descricao: "Aditivo 2 — OC 231297-2", unidade: null, quantidade: null }],
    aceites: [],
    op: { id: "op1", numero: "120", cliente: "TMSA Tecnologia em movimentação", obra: "TPR-00699", referencias: [] },
  },
  pedido: { rotulo: "OC", codigo: "231297-2", descricao: "Longarinas", itens: [{ rotulo: "ETC", codigo: "ETC-00699-87" }], tags: [{ rotulo: "TAG", codigo: "TC 8011", frente: "A" }] },
  projetos: ["TPR TPR00699"],
};

describe("comunicado de aditivo", () => {
  it("gera um PDF com o pedido, as TAGs e as providências", async () => {
    const bytes = await gerarComunicadoAditivoPDF(dados);
    expect(bytes.length).toBeGreaterThan(2000);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
  });
  it("o e-mail traz o pedido do cliente, as providências e o marcador do botão de aceite", () => {
    const { subject, html } = montarEmailAditivo({ dados, userName: "Vitor", mensagem: "Entrou a OC nova." });
    expect(subject).toBe("Aditivo 2 · OP-120 · TMSA Tecnologia em movimentação · TPR-00699");
    expect(html).toContain("__ACEITE__");
    expect(html).toContain("OC do aditivo");
    expect(html).toContain("231297-2");
    expect(html).toContain("TC 8011");
    expect(html).toContain("Entrou a OC nova.");
    for (const [setor] of PROVIDENCIAS) expect(html).toContain(setor);
    expect(html).not.toMatch(/R\$/); // comunicado de produção: sem valores
  });
  it("lembrete muda o assunto e avisa a pendência", () => {
    const { subject, html } = montarEmailAditivo({ dados, lembrete: true });
    expect(subject).toMatch(/^Lembrete — /);
    expect(html).toContain("pendente");
  });
});
