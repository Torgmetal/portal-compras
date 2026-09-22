import { it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireUser: vi.fn().mockResolvedValue({ id: "u", name: "Renato Massano", email: "massano.renato@gmail.com" }) }));
vi.mock("@/lib/cliente-faturamento-servidor", () => ({ opsComFaturamentoPara: vi.fn().mockResolvedValue([]) }));
import { GET } from "@/app/api/cliente/meu-espaco/route";

// O espaço do Renato: contato da OP-105, sem nenhum documento endereçado a ele.
// Vitor (22/09/2026): "deixe disponível para ele consultar quando o Davi assinar".

const CONTATOS = [
  { nome: "Rogério Porsch", email: "rogerio.porsch@tmsa.ind.br" },
  { nome: "Renato Massano", email: "massano.renato@gmail.com", funcao: "Inspetor de Qualidade" },
];
const OP = { id: "op105", numero: "105", cliente: "TMSA", obra: "Bianchini", clienteEmail: "rogerio.porsch@tmsa.ind.br", clienteContatos: CONTATOS };
const TORG = { email: "qualidade@torg.com.br", assinadoEm: new Date("2026-09-21T10:00:00Z") };
const DAVI_OK = { email: "pinho.davi@tmsa.ind.br", assinadoEm: new Date("2026-09-23T13:00:00Z") };
const DAVI_NAO = { email: "pinho.davi@tmsa.ind.br", assinadoEm: null };

const relatorio = (assinaturas, status = "EM_ANDAMENTO") => ({
  id: "rel1", codigo: "RPM-105-002", tipo: "PRE_MONTAGEM", revisao: 0, opNumero: "105",
  envioAssinatura: { id: "env1", status, titulo: "RPM-105-002 — Inspeção de pré-montagem · OP-105", enviadoEm: new Date("2026-09-21T09:00:00Z"), assinaturas },
});

beforeEach(() => {
  vi.clearAllMocks();
  for (const m of ["assinaturaDocumento", "dataBookAssinatura", "portalDestinatario", "planoResponsavel", "portalCliente", "oPKickOff", "relatorioInspecao"]) {
    mockPrisma[m].findMany.mockResolvedValue([]);
  }
  mockPrisma.oP.findMany.mockImplementation(async ({ where }) => (where?.numero ? [OP] : [OP]));
});

const ler = async () => {
  const r = await GET();
  expect(r.status).toBe(200);
  return r.json();
};

it("enquanto o Davi não assina, a obra aparece e a lista continua vazia", async () => {
  mockPrisma.relatorioInspecao.findMany.mockResolvedValue([relatorio([TORG, DAVI_NAO])]);
  const j = await ler();
  expect(j.obras.map((o) => o.opNumero)).toEqual(["105"]);
  expect(j.obras[0].documentos).toEqual([]);
});

it("assinado por todos, o relatório entra para CONSULTA — sem link de assinar e sem contar como pendente", async () => {
  mockPrisma.relatorioInspecao.findMany.mockResolvedValue([relatorio([TORG, DAVI_OK], "CONCLUIDO")]);
  const j = await ler();
  const docs = j.obras[0].documentos;
  expect(docs).toHaveLength(1);
  expect(docs[0]).toMatchObject({ somenteLeitura: true, link: null, pdf: "/api/cliente/relatorio/rel1/pdf" });
  expect(docs[0].titulo).toContain("RPM-105-002");
  // ⚠ consulta não é pendência: a obra não pode dizer "1 a assinar" para quem não assina nada
  expect(j.obras[0].pendentes).toBe(0);
});

it("obra em que ele NÃO é contato não abre os relatórios dela", async () => {
  mockPrisma.oP.findMany.mockImplementation(async () => [{ ...OP, clienteContatos: [CONTATOS[0]] }]);
  mockPrisma.relatorioInspecao.findMany.mockResolvedValue([relatorio([TORG, DAVI_OK], "CONCLUIDO")]);
  const j = await ler();
  expect(j.obras).toEqual([]); // sem ser contato, a obra nem aparece
});

it("o que ELE mesmo assina continua vindo pela assinatura, sem duplicar com a consulta", async () => {
  mockPrisma.assinaturaDocumento.findMany.mockResolvedValue([{
    token: "tok", assinadoEm: new Date("2026-09-23T14:00:00Z"), convidadoEm: null, ordem: null, setor: "Cliente", ip: "1.2.3.4",
    envio: { id: "env1", titulo: "RPM-105-002 — Inspeção de pré-montagem · OP-105", tipo: "RELATORIO_INSPECAO", opNumero: "105", revisao: 0, enviadoEm: new Date("2026-09-21T09:00:00Z"), status: "CONCLUIDO", snapshot: {} },
  }]);
  mockPrisma.relatorioInspecao.findMany.mockResolvedValue([relatorio([TORG, DAVI_OK], "CONCLUIDO")]);
  const j = await ler();
  const docs = j.obras[0].documentos;
  expect(docs).toHaveLength(1);
  expect(docs[0].link).toBe("/assinar/tok");
});
