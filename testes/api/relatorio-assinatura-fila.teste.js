import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: vi.fn().mockResolvedValue({ id: "u", email: "qualidade@torg.com.br" }) }));
const email = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/email", () => email);
vi.mock("@/lib/email-layout", () => ({ cabecalhoEmail: (t) => `<h1>${t}</h1>` }));
vi.mock("@/lib/databook-assinaturas", () => ({ baseUrlDe: () => "http://localhost" }));
vi.mock("@/lib/relatorio-inspecao", () => ({ vincularNoDataBook: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/relatorio-dimensional", () => ({ baixarDesenho: vi.fn() }));
vi.mock("@/lib/relatorio-render", () => ({ gerarPDFdoRelatorio: vi.fn().mockResolvedValue(new Uint8Array([37, 80, 68, 70])) }));
import { POST } from "@/app/api/qualidade/inspecoes/[id]/assinatura/route";

// Geraldo (29/09/2026): "precisa colocar uma lógica para aprovação de relatório: primeiro inspetor,
// depois torg e por último o cliente — exemplo: o Davi recebeu o relatório ao mesmo tempo que eu".
// O envio convidava TODOS os assinantes de uma vez; o Davi (TMSA) abriu o PDF sem a assinatura da
// Torg e devolveu o RIP-089-002 ("Falta assinatura").

const REL = {
  id: "r1", codigo: "RIP-089-002", tipo: "PINTURA", opNumero: "089", status: "RASCUNHO", envioAssinaturaId: null,
  emitidoEm: null, resultados: { prepProcedimento: "Jateamento abrasivo" }, linhas: [], marcas: ["T89C1"],
};
// na ordem em que o Geraldo costuma digitar: ele primeiro
const DEST = [
  { nome: "Geraldo Tank", email: "qualidade@torg.com.br", papel: "Torg Metal" },
  { nome: "Davi Pinho", email: "pinho.davi@tmsa.ind.br", papel: "Cliente" },
  { nome: "Alexandre Stival", email: "stival2112@gmail.com", papel: "Inspetor" },
];
const ja = (extra) => ({ convidadoEm: null, assinadoEm: null, ...extra });

let criadas;
beforeEach(() => {
  vi.clearAllMocks();
  criadas = [];
  mockPrisma.relatorioInspecao.findUnique.mockResolvedValue(REL);
  mockPrisma.relatorioInspecao.update.mockResolvedValue({});
  mockPrisma.envioAssinatura.create.mockResolvedValue({ id: "env1" });
  mockPrisma.fotoInspecao.findMany.mockResolvedValue([]);
  mockPrisma.assinaturaDocumento.findMany.mockResolvedValue([]);
  mockPrisma.assinaturaDocumento.create.mockImplementation(async ({ data }) => {
    const a = { id: `a${criadas.length + 1}`, assinadoEm: null, convidadoEm: null, ...data };
    criadas.push(a);
    return a;
  });
  mockPrisma.assinaturaDocumento.update.mockResolvedValue({});
  mockPrisma.oP.findFirst.mockResolvedValue({ cliente: "TMSA", obra: "Bianchini", refCliente: null });
  mockPrisma.auditLog.create.mockResolvedValue({});
  email.sendEmail.mockResolvedValue({ ok: true });
});

const enviar = async (destinatarios = DEST) => {
  const r = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ destinatarios }) }), { params: Promise.resolve({ id: "r1" }) });
  return { status: r.status, j: await r.json() };
};
const para = () => email.sendEmail.mock.calls.map((c) => c[0].to);

describe("envio do relatório para assinatura, em fila", () => {
  it("no primeiro envio só o inspetor recebe — com o PDF", async () => {
    const { status } = await enviar();
    expect(status).toBe(200);
    expect(para()).toEqual(["stival2112@gmail.com"]);
    expect(email.sendEmail.mock.calls[0][0].attachments?.[0]?.filename).toBe("RIP-089-002.pdf");
  });

  it("todos entram na fila, na ordem inspetor → Torg Metal → cliente", async () => {
    await enviar();
    const ordem = Object.fromEntries(criadas.map((a) => [a.email, a.ordem]));
    expect(ordem["stival2112@gmail.com"]).toBeLessThan(ordem["qualidade@torg.com.br"]);
    expect(ordem["qualidade@torg.com.br"]).toBeLessThan(ordem["pinho.davi@tmsa.ind.br"]);
  });

  it("só quem recebeu o e-mail fica marcado como convidado", async () => {
    await enviar();
    const alexandre = criadas.find((a) => a.email === "stival2112@gmail.com");
    expect(mockPrisma.assinaturaDocumento.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.assinaturaDocumento.update.mock.calls[0][0]).toMatchObject({ where: { id: alexandre.id }, data: { convidadoEm: expect.any(Date) } });
  });

  it("a tela fica sabendo quem está com a vez e quem espera", async () => {
    const { j } = await enviar();
    expect(j.enviados).toBe(1);
    expect(j.vez).toMatchObject({ nome: "Alexandre Stival", papel: "Inspetor" });
    expect(j.naFila).toEqual([{ nome: "Geraldo Tank", papel: "Torg Metal" }, { nome: "Davi Pinho", papel: "Cliente" }]);
  });

  it("reenviar convida de novo só quem está com a vez", async () => {
    mockPrisma.relatorioInspecao.findUnique.mockResolvedValue({ ...REL, status: "EMITIDO", envioAssinaturaId: "env1", emitidoEm: new Date() });
    mockPrisma.assinaturaDocumento.findMany.mockResolvedValue([
      ja({ id: "a1", email: "stival2112@gmail.com", nome: "Alexandre Stival", setor: "Inspetor", token: "t1", ordem: 100, assinadoEm: new Date(), convidadoEm: new Date() }),
      ja({ id: "a2", email: "qualidade@torg.com.br", nome: "Geraldo Tank", setor: "Torg Metal", token: "t2", ordem: 201 }),
      ja({ id: "a3", email: "pinho.davi@tmsa.ind.br", nome: "Davi Pinho", setor: "Cliente", token: "t3", ordem: 302 }),
    ]);
    await enviar();
    expect(mockPrisma.assinaturaDocumento.create).not.toHaveBeenCalled();
    expect(para()).toEqual(["qualidade@torg.com.br"]);
    expect(email.sendEmail.mock.calls[0][0].html).toContain("/assinar/t2");
  });

  it("envio antigo, sem ordem, continua em paralelo: reenviar vai para todos que faltam", async () => {
    mockPrisma.relatorioInspecao.findUnique.mockResolvedValue({ ...REL, status: "EMITIDO", envioAssinaturaId: "env1", emitidoEm: new Date() });
    mockPrisma.assinaturaDocumento.findMany.mockResolvedValue([
      ja({ id: "a2", email: "qualidade@torg.com.br", nome: "Geraldo Tank", setor: "Torg Metal", token: "t2", ordem: null }),
      ja({ id: "a3", email: "pinho.davi@tmsa.ind.br", nome: "Davi Pinho", setor: "Cliente", token: "t3", ordem: null }),
    ]);
    await enviar(DEST.slice(0, 2));
    expect(para().sort()).toEqual(["pinho.davi@tmsa.ind.br", "qualidade@torg.com.br"]);
  });

  it("e-mail que não saiu não marca convite — e a tela recebe o motivo", async () => {
    email.sendEmail.mockResolvedValue({ ok: false, error: "endereço recusado" });
    const { j } = await enviar();
    expect(j.enviados).toBe(0);
    expect(j.falhas[0]).toMatchObject({ email: "stival2112@gmail.com" });
    expect(mockPrisma.assinaturaDocumento.update).not.toHaveBeenCalled();
  });
});
