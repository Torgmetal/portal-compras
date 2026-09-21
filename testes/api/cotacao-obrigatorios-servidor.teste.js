// OS CAMPOS OBRIGATÓRIOS VALEM NO SERVIDOR, NÃO SÓ NA TELA.
//
// ⚠⚠ Matheus (21/09/2026): "não deixe o fornecedor conseguir enviar a proposta sem preencher os
// campos obrigatórios". A tela já barrava as seis regras — medido: com o formulário vazio a API
// nem chega a ser chamada. O buraco era o outro lado: no schema da rota pública, CNPJ, número da
// proposta, prazo de entrega e condição de pagamento eram `.optional().nullable()`. Obrigatório só
// no formulário é obrigatório apenas para quem não tem motivo de burlá-lo — aba velha aberta antes
// desta versão, reenvio e POST fora da tela passavam direto.
//
// ⚠ O frete já tinha as duas travas desde 17/09; este arquivo faz o mesmo pelos outros quatro.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/omie-pedido-compra", () => ({ resolverFornecedorPorCnpj: vi.fn() }));
vi.mock("@/lib/email", () => ({ notificarEvento: vi.fn() }));
vi.mock("@/lib/notificacoes", () => ({ criarNotificacao: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { POST as submeter } from "@/app/api/cotacao/submeter/[token]/route";

const enviar = (body) => submeter(
  new Request("http://localhost/api/cotacao/submeter/tk", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }),
  { params: { token: "tk" } },
);

const COMPLETO = {
  itens: [{ cotacaoItemId: "ci1", precoUnit: 7.8, qtdCotada: 109.2, semEstoque: false }],
  tipoFrete: "CIF",
  cnpj: "45.987.062/0001-77",
  numeroProposta: "20250698",
  prazoEntrega: "3 dias úteis",
  condicaoPagamento: "28/42/56",
};

beforeEach(() => {
  vi.resetAllMocks();
  mockPrisma.cotacao.findUnique.mockResolvedValue({
    id: "cot1", token: "tk", status: "ENVIADA", nCodOmie: null, itens: [{ id: "ci1" }],
  });
  mockPrisma.cotacao.update.mockResolvedValue({ id: "cot1" });
  mockPrisma.cotacaoItem.update.mockResolvedValue({});
  mockPrisma.cotacaoItem.findMany.mockResolvedValue([]);
  mockPrisma.rMItem.updateMany.mockResolvedValue({ count: 0 });
});

describe("a rota pública exige o que a tela exige", () => {
  it("o envio completo passa — a trava não aperta mais que o formulário", async () => {
    expect((await enviar(COMPLETO)).status).toBe(200);
  });

  // ⚠ Um caso por campo, e não um teste só: recusar por CNPJ com a mensagem do prazo mandaria o
  // fornecedor procurar no lugar errado, e ele não tem a quem perguntar.
  const faltando = [
    ["cnpj", "CNPJ"],
    ["numeroProposta", "número da proposta"],
    ["prazoEntrega", "prazo de entrega"],
    ["condicaoPagamento", "condição de pagamento"],
  ];
  for (const [campo, trecho] of faltando) {
    it(`recusa sem ${campo}, dizendo qual campo falta`, async () => {
      const r = await enviar({ ...COMPLETO, [campo]: "" });
      expect(r.status).toBe(400);
      const { error } = await r.json();
      expect(error).toContain(trecho);
      // ⚠⚠ E NADA É GRAVADO. Recusar depois de escrever metade seria pior que aceitar.
      expect(mockPrisma.cotacao.update).not.toHaveBeenCalled();
      expect(mockPrisma.cotacaoItem.update).not.toHaveBeenCalled();
    });
  }

  // ⚠ Campo ausente e campo vazio são o MESMO problema para quem recebe a proposta.
  it("chave ausente vale o mesmo que vazia", async () => {
    const { cnpj: _cnpj, ...semCnpj } = COMPLETO;
    expect((await enviar(semCnpj)).status).toBe(400);
  });

  // ⚠ CPF de 11 dígitos é pessoa física legítima — a regra é a mesma da tela.
  it("aceita CPF de 11 dígitos, recusa documento truncado", async () => {
    expect((await enviar({ ...COMPLETO, cnpj: "123.456.789-09" })).status).toBe(200);
    expect((await enviar({ ...COMPLETO, cnpj: "4598706" })).status).toBe(400);
  });

  // ⚠⚠ A mensagem vai para um fornecedor, não para um desenvolvedor: nada de despejo do Zod.
  it("a recusa não devolve JSON de erro do Zod na cara do fornecedor", async () => {
    const { error } = await (await enviar({ ...COMPLETO, numeroProposta: "" })).json();
    expect(error).not.toContain('"code"');
    expect(error).not.toContain("invalid_type");
  });
});
