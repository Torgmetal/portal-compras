// A conferência da pasta da Engenharia e a impressão em lote enxergam a pasta INTEIRA — as duas
// liam só a primeira página do Graph (OP-118, 26/09/2026: 766 arquivos da pasta Croqui/B de fora).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/sharepoint", () => ({
  getAccessToken: vi.fn(async () => "tok"),
  acharPastaOp: vi.fn(async () => "/OPs/OP-118"),
  uploadFileToFolder: vi.fn(),
}));

import { inventarioEngenharia } from "@/lib/pasta-engenharia";
import { varrerDesenhosDaOp } from "@/lib/desenhos-lote";
import { listarNaLiberacao } from "@/lib/pastas-liberacao";

const resposta = (corpo) => ({ ok: true, status: 200, json: async () => corpo });
const pasta = (name) => ({ name, folder: { childCount: 1 } });
const arquivo = (name) => ({ id: `id-${name}`, name, file: {}, size: 1024, lastModifiedDateTime: "2026-09-25T12:00:00Z" });

// a árvore: .../2.5 Projetos/2.5.2 Fabricação/2.5.2.2 Croqui/B — e B tem DUAS páginas
function servidor() {
  return vi.fn(async (url) => {
    if (String(url).startsWith("https://proxima/B")) return resposta({ value: [arquivo("T118B-P382 - CROQUI.pdf"), arquivo("T118B-P470 - CROQUI.pdf")] });
    const caminho = decodeURI(String(url).split("root:")[1]?.split(":/children")[0] || "");
    if (caminho.endsWith("/2.5 Projetos")) return resposta({ value: [pasta("2.5.2 Fabricação")] });
    if (caminho.endsWith("/2.5.2 Fabricação")) return resposta({ value: [pasta("2.5.2.2 Croqui")] });
    if (caminho.endsWith("/2.5.2.2 Croqui")) return resposta({ value: [pasta("B")] });
    if (caminho.endsWith("/B")) return resposta({ value: [arquivo("T118B-P295 - CROQUI.pdf")], "@odata.nextLink": "https://proxima/B?page=2" });
    return resposta({ value: [] });
  });
}

beforeEach(() => { process.env.SHAREPOINT_DRIVE_ID = "drive"; vi.stubGlobal("fetch", servidor()); });
afterEach(() => vi.unstubAllGlobals());

describe("a pasta inteira, não só a primeira página", () => {
  it("a conferência vê os croquis da segunda página", async () => {
    const inv = await inventarioEngenharia("118");
    expect(inv.pdfs.map((p) => p.nome)).toEqual(["T118B-P295 - CROQUI.pdf", "T118B-P382 - CROQUI.pdf", "T118B-P470 - CROQUI.pdf"]);
  });

  it("a impressão em lote também acha os da segunda página", async () => {
    const lista = await varrerDesenhosDaOp("118");
    expect(lista.map((d) => d.nome)).toEqual(["T118B-P295 - CROQUI.pdf", "T118B-P382 - CROQUI.pdf", "T118B-P470 - CROQUI.pdf"]);
  });

  it("a pasta do dia da liberação lista a pasta inteira", async () => {
    const itens = await listarNaLiberacao("tok", "OPs/OP-118/2. Engenharia/2.5 Projetos/2.5.2 Fabricação/2.5.2.2 Croqui/B");
    expect(itens.map((i) => i.name)).toEqual(["T118B-P295 - CROQUI.pdf", "T118B-P382 - CROQUI.pdf", "T118B-P470 - CROQUI.pdf"]);
  });
});
