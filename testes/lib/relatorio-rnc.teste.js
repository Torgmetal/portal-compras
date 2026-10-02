// O "RNC Nº" do pull-off sai sozinho da RNC aberta pela reprovação — e isso tem de valer em TODO caminho que
// gera o PDF. Até a verificação de 02/10/2026 só a tela buscava a RNC: quem assinava pelo link, o anexo do
// e-mail e a cópia arquivada na pasta da obra saíam com o campo em branco.
import { it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
import { rncDoRelatorio } from "@/lib/relatorio-rnc";

beforeEach(() => { vi.clearAllMocks(); mockPrisma.naoConformidade.findUnique.mockResolvedValue({ numero: 15, ano: 2026 }); });

it("pull-off com RNC aberta: devolve o número e o ano", async () => {
  expect(await rncDoRelatorio({ tipo: "PULL_OFF", rncId: "n1" })).toEqual({ numero: 15, ano: 2026 });
});

it("outros tipos (o campo não existe) e relatório sem RNC: nem consulta", async () => {
  expect(await rncDoRelatorio({ tipo: "LP", rncId: "n1" })).toBeNull();
  expect(await rncDoRelatorio({ tipo: "PULL_OFF", rncId: null })).toBeNull();
  expect(mockPrisma.naoConformidade.findUnique).not.toHaveBeenCalled();
});

it("falhar a consulta não segura o documento", async () => {
  mockPrisma.naoConformidade.findUnique.mockRejectedValue(new Error("fora do ar"));
  expect(await rncDoRelatorio({ tipo: "PULL_OFF", rncId: "n1" })).toBeNull();
});

it("os quatro caminhos que geram o PDF buscam a RNC", () => {
  for (const arq of ["lib/relatorio-pdf-fonte.js", "lib/relatorio-arquivo.js", "app/api/assinar/[token]/pdf/route.js", "app/api/qualidade/inspecoes/[id]/assinatura/route.js"]) {
    expect(fs.readFileSync(arq, "utf8"), arq).toMatch(/rncDoRelatorio\(/);
  }
});
