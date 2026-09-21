import { it, expect, vi, beforeEach, describe } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";

const mocks = vi.hoisted(() => ({ role: vi.fn(), handleUpload: vi.fn(), head: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: mocks.role }));
vi.mock("@vercel/blob/client", () => ({ handleUpload: mocks.handleUpload }));
vi.mock("@vercel/blob", () => ({ head: mocks.head }));

import { POST, PUT, DELETE } from "@/app/api/qualidade/inspecoes/[id]/desenho-anexo/route";
import { desenhosComAnexo } from "@/lib/inspecao-anexo";

// "Estamos com um anexado lá, porém dá erro" (Vitor, OP-105, 21/09/2026). Medido: o PDF subiu
// para o blob duas vezes (18/09 e 21/09) e NENHUM relatório do banco jamais teve desenho anexado.
// O vínculo só era gravado no `onUploadCompleted` — o webhook que o Vercel Blob chama SEM sessão —
// e a rota exigia `requireRole` antes de qualquer coisa: o webhook tomava 401 e o anexo morria.

const URL_BLOB = "https://abc123.public.blob.vercel-storage.com/T105%20-%20Montagem-087xBJzLC5TJUqbgPOKpFJ9jY9lPRW.pdf";
const params = { params: Promise.resolve({ id: "r" }) };
const req = (method, body) => new Request("http://localhost/api/qualidade/inspecoes/r/desenho-anexo", { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const rel = (extra = {}) => ({ id: "r", tipo: "PRE_MONTAGEM", envioAssinaturaId: null, desenhos: [{ marca: "T105 - Tolerâcias", nome: "T105 - Tolerâcias.pdf", caminho: "/OP-105/2.5.4 Montagem/T105 - Tolerâcias.pdf", escolhido: true }], ...extra });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.role.mockResolvedValue({ id: "u", name: "Geraldo" });
  mockPrisma.relatorioInspecao.findUnique.mockResolvedValue(rel());
  mockPrisma.relatorioInspecao.update.mockImplementation(async ({ data }) => ({ id: "r", ...data }));
  mockPrisma.auditLog.create.mockResolvedValue({});
});

describe("desenhosComAnexo — a regra pura", () => {
  it("pré-montagem SOMA (sem repetir a mesma URL); os outros tipos TROCAM", () => {
    const atuais = rel().desenhos;
    const somado = desenhosComAnexo(atuais, "PRE_MONTAGEM", { url: URL_BLOB, nome: "T105 - Montagem.pdf" });
    expect(somado.map((d) => d.marca)).toEqual(["T105 - Tolerâcias", "T105 - Montagem"]);
    expect(somado[1]).toMatchObject({ url: URL_BLOB, anexado: true, nome: "T105 - Montagem.pdf" });
    expect(desenhosComAnexo(somado, "PRE_MONTAGEM", { url: URL_BLOB, nome: "T105 - Montagem.pdf" })).toHaveLength(2);
    expect(desenhosComAnexo(atuais, "DIMENSIONAL", { url: URL_BLOB, nome: "T105 - Montagem.pdf" }).map((d) => d.marca)).toEqual(["T105 - Montagem"]);
  });
});

describe("POST — o webhook do blob chega SEM sessão", () => {
  it("o vínculo é gravado no onUploadCompleted mesmo sem cookie; a sessão só é exigida para gerar o token", async () => {
    mocks.role.mockRejectedValue(new Error("Unauthorized")); // é assim que o webhook chega
    mocks.handleUpload.mockImplementation(async ({ onUploadCompleted }) => {
      await onUploadCompleted({ blob: { url: URL_BLOB, pathname: "T105%20-%20Montagem-087xBJzLC5TJUqbgPOKpFJ9jY9lPRW.pdf" }, tokenPayload: JSON.stringify({ relatorioId: "r", userId: "u" }) });
      return { response: "ok" };
    });
    const r = await POST(new Request("http://localhost/api/qualidade/inspecoes/r/desenho-anexo", { method: "POST", body: JSON.stringify({ type: "blob.upload-completed", payload: {} }) }), params);
    expect(r.status).toBe(200);
    expect(mockPrisma.relatorioInspecao.update).toHaveBeenCalledTimes(1);
    const gravado = mockPrisma.relatorioInspecao.update.mock.calls[0][0].data.desenhos;
    expect(gravado.map((d) => d.marca)).toEqual(["T105 - Tolerâcias", "T105 - Montagem"]);
  });

  it("gerar o token continua exigindo a sessão", async () => {
    mocks.role.mockRejectedValue(new Error("Unauthorized"));
    mocks.handleUpload.mockImplementation(async ({ onBeforeGenerateToken }) => onBeforeGenerateToken());
    const r = await POST(new Request("http://localhost/api/qualidade/inspecoes/r/desenho-anexo", { method: "POST", body: JSON.stringify({ type: "blob.generate-client-token", payload: {} }) }), params);
    expect(r.status).toBe(401);
    expect(mockPrisma.relatorioInspecao.update).not.toHaveBeenCalled();
  });
});

describe("PUT — o navegador vincula o que acabou de subir (não depende do webhook)", () => {
  it("grava o anexo depois de conferir que o arquivo existe no blob", async () => {
    mocks.head.mockResolvedValue({ url: URL_BLOB, pathname: "T105 - Montagem-087xBJzLC5TJUqbgPOKpFJ9jY9lPRW.pdf", contentType: "application/pdf", size: 1234 });
    const r = await PUT(req("PUT", { url: URL_BLOB }), params);
    expect(r.status).toBe(200);
    expect(mocks.head).toHaveBeenCalledWith(URL_BLOB);
    const gravado = mockPrisma.relatorioInspecao.update.mock.calls[0][0].data.desenhos;
    expect(gravado[1]).toMatchObject({ url: URL_BLOB, anexado: true });
    expect((await r.json()).total).toBe(2);
  });

  // ⚠ a rota grava uma URL vinda do navegador: só do NOSSO blob, só PDF, e só se existir.
  it("recusa URL que não é do blob da Torg, e recusa arquivo que não existe", async () => {
    const r1 = await PUT(req("PUT", { url: "https://exemplo.com/qualquer.pdf" }), params);
    expect(r1.status).toBe(400);
    mocks.head.mockRejectedValue(new Error("Vercel Blob: The requested blob does not exist"));
    const r2 = await PUT(req("PUT", { url: URL_BLOB }), params);
    expect(r2.status).toBe(400);
    expect(mockPrisma.relatorioInspecao.update).not.toHaveBeenCalled();
  });

  it("relatório enviado para assinatura não muda mais", async () => {
    mockPrisma.relatorioInspecao.findUnique.mockResolvedValue(rel({ envioAssinaturaId: "env1" }));
    const r = await PUT(req("PUT", { url: URL_BLOB }), params);
    expect(r.status).toBe(409);
  });
});

describe("DELETE", () => {
  it("com marca, tira só aquele anexo e mantém os outros; sem marca, zera tudo (como antes)", async () => {
    mockPrisma.relatorioInspecao.findUnique.mockResolvedValue(rel({ desenhos: [...rel().desenhos, { marca: "T105 - Montagem", nome: "T105 - Montagem.pdf", url: URL_BLOB, anexado: true }] }));
    const r = await DELETE(new Request("http://localhost/api/qualidade/inspecoes/r/desenho-anexo?marca=T105%20-%20Montagem", { method: "DELETE" }), params);
    expect(r.status).toBe(200);
    expect(mockPrisma.relatorioInspecao.update.mock.calls[0][0].data.desenhos.map((d) => d.marca)).toEqual(["T105 - Tolerâcias"]);
    const r2 = await DELETE(new Request("http://localhost/api/qualidade/inspecoes/r/desenho-anexo", { method: "DELETE" }), params);
    expect(r2.status).toBe(200);
    expect(mockPrisma.relatorioInspecao.update.mock.calls[1][0].data.desenhos).toEqual([]);
  });
});
