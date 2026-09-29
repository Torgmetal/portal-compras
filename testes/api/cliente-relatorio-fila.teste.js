import { it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireUser: vi.fn().mockResolvedValue({ id: "u", name: "Davi Pinho", email: "pinho.davi@tmsa.ind.br" }) }));
vi.mock("@/lib/cliente-faturamento-servidor", () => ({ opsComFaturamentoPara: vi.fn().mockResolvedValue([]) }));
import { GET } from "@/app/api/cliente/meu-espaco/route";

// Geraldo (29/09/2026): "o Davi recebeu o relatório ao mesmo tempo que eu (…) ele abriu e falou: está
// sem a assinatura de vocês". Tirar o e-mail dele da largada não basta: o espaço do cliente listava o
// relatório com "aguardando a vez" E com o PDF aberto — ele veria o mesmo documento sem a Torg.

const OP = { id: "op89", numero: "089", cliente: "TMSA", obra: "Ampliação", clienteEmail: "pinho.davi@tmsa.ind.br", clienteContatos: [{ nome: "Davi Pinho", email: "pinho.davi@tmsa.ind.br" }] };
const envio = (tipo) => ({ id: "env1", titulo: "RIP-089-002 — Inspeção de pintura · OP-089", tipo, opNumero: "089", revisao: 2, enviadoEm: new Date("2026-09-29T17:42:00Z"), status: "EM_ANDAMENTO", snapshot: { relatorioId: "rel1" } });
const DAVI = (tipo) => ({ token: "t3", assinadoEm: null, convidadoEm: null, ordem: 302, setor: "Cliente", ip: null, envio: envio(tipo) });
const fila = (torgAssinou) => [
  { envioId: "env1", ordem: 100, assinadoEm: new Date("2026-09-29T18:00:00Z") },
  { envioId: "env1", ordem: 201, assinadoEm: torgAssinou ? new Date("2026-09-29T18:10:00Z") : null },
  { envioId: "env1", ordem: 302, assinadoEm: null },
];

let torgAssinou, tipo;
beforeEach(() => {
  vi.clearAllMocks();
  torgAssinou = false;
  tipo = "RELATORIO_INSPECAO";
  for (const m of ["dataBookAssinatura", "portalDestinatario", "planoResponsavel", "portalCliente", "oPKickOff", "relatorioInspecao"]) {
    mockPrisma[m].findMany.mockResolvedValue([]);
  }
  mockPrisma.assinaturaDocumento.findMany.mockImplementation(async ({ where }) => (where?.envioId ? fila(torgAssinou) : [DAVI(tipo)]));
  mockPrisma.oP.findMany.mockResolvedValue([OP]);
});

const doRip = async () => {
  const r = await GET();
  expect(r.status).toBe(200);
  const j = await r.json();
  return j.obras.flatMap((o) => o.documentos).filter((d) => d.titulo?.includes("RIP-089-002"));
};

it("antes da vez dele, o relatório de inspeção não aparece para o cliente", async () => {
  expect(await doRip()).toEqual([]);
});

it("chegou a vez: aparece para assinar, mesmo que o e-mail do convite não tenha saído", async () => {
  torgAssinou = true;
  const docs = await doRip();
  expect(docs).toHaveLength(1);
  expect(docs[0]).toMatchObject({ link: "/assinar/t3", aguardandoVez: false });
});

it("plano (PLP) segue como era: aparece, marcado 'aguardando a vez'", async () => {
  tipo = "PLP";
  const docs = await doRip();
  expect(docs).toHaveLength(1);
  expect(docs[0].aguardandoVez).toBe(true);
});
