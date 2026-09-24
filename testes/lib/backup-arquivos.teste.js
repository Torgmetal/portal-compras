import { beforeEach, describe, expect, it, vi } from "vitest";

// A SEGUNDA CÓPIA DO QUE SÓ EXISTIA NO VERCEL BLOB (24/09/2026): 323 anexos de Data Book e 293 fotos de
// inspeção, num lugar sem lixeira nem versão. Vitor: "como está nossos backups?" → "pode atacar".

const db = vi.hoisted(() => ({
  anexos: [], fotos: [], relatorios: [], updates: [], auditorias: [],
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    documentoQualidade: {
      findMany: vi.fn(async () => db.anexos),
      update: vi.fn(async (a) => { db.updates.push(a); return {}; }),
    },
    $queryRaw: vi.fn(async () => db.fotos),
    relatorioInspecao: { findMany: vi.fn(async () => db.relatorios) },
    auditLog: { create: vi.fn(async (a) => { db.auditorias.push(a.data); return {}; }) },
  },
}));
vi.mock("@/lib/sharepoint", () => ({ ensureFolder: vi.fn(), uploadFileToFolder: vi.fn() }));

const { copiarArquivosSemBackup, PASTA_DATABOOK, PASTA_FOTOS, ACAO_FOTO_COPIADA } = await import("@/lib/backup-arquivos");
const { PASTA_BACKUP } = await import("@/lib/backup-banco");

const BLOB = (nome) => `https://abc123.public.blob.vercel-storage.com/${nome}`;
let enviados;
let pastasPedidas;
const enviar = vi.fn(async (a) => { enviados.push(a); return { webUrl: `https://sp/${a.fileName}`, id: `item-${a.fileName}` }; });
const criarPasta = vi.fn(async (p) => { pastasPedidas.push(p); await new Promise((r) => setTimeout(r, 1)); });
const buscar = vi.fn(async (url) => (url.includes("sumiu")
  ? { ok: false, status: 404 }
  : { ok: true, arrayBuffer: async () => new TextEncoder().encode(`bytes de ${url}`).buffer }));

beforeEach(() => {
  Object.assign(db, { anexos: [], fotos: [], relatorios: [], updates: [], auditorias: [] });
  enviados = []; pastasPedidas = [];
  vi.clearAllMocks();
});

describe("cópia dos arquivos que só existiam no Blob", () => {
  it("anexo do Data Book: vai para a pasta da OP na área de backup e o documento guarda a cópia", async () => {
    db.anexos = [{ id: "d1", opNumero: "102", arquivoUrl: BLOB("cert.pdf"), arquivoNome: "Certificado R 261163.pdf", arquivoTipo: "application/pdf" }];
    const p = await copiarArquivosSemBackup({ enviar, criarPasta, buscar });
    expect(p).toMatchObject({ anexos: 1, fotos: 0, falhas: [] });
    expect(enviados[0]).toMatchObject({
      folderPath: `${PASTA_DATABOOK}/OP-102`, fileName: "d1 - Certificado R 261163.pdf",
      contentType: "application/pdf", conflict: "replace",
    });
    expect(db.updates[0]).toEqual({ where: { id: "d1" }, data: { sharepointUrl: "https://sp/d1 - Certificado R 261163.pdf", sharepointItemId: "item-d1 - Certificado R 261163.pdf" } });
  });

  it("foto: nome com o código do relatório e o id; o registro no AuditLog é o controle do que já foi", async () => {
    db.fotos = [
      { id: "f1", opNumero: "102", url: BLOB("foto-a.jpg"), relatorioId: "r1" },
      { id: "f2", opNumero: "103", url: BLOB("foto-b.png"), relatorioId: null },
    ];
    db.relatorios = [{ id: "r1", codigo: "RIP-102-001" }];
    const p = await copiarArquivosSemBackup({ enviar, criarPasta, buscar });
    expect(p).toMatchObject({ fotos: 2, falhas: [] });
    const nomes = enviados.map((e) => `${e.folderPath}|${e.fileName}|${e.contentType}`).sort();
    expect(nomes).toEqual([
      `${PASTA_FOTOS}/OP-102|RIP-102-001 - f1.jpg|image/jpeg`,
      `${PASTA_FOTOS}/OP-103|sem relatório - f2.png|image/png`,
    ]);
    expect(db.auditorias.filter((a) => a.action === ACAO_FOTO_COPIADA).map((a) => a.entityId).sort()).toEqual(["f1", "f2"]);
  });

  it("cria as pastas abaixo da área de backup, nível a nível, e cada uma uma vez só — mesmo em paralelo", async () => {
    db.fotos = Array.from({ length: 8 }, (_, i) => ({ id: `f${i}`, opNumero: "102", url: BLOB(`f${i}.jpg`), relatorioId: null }));
    await copiarArquivosSemBackup({ enviar, criarPasta, buscar });
    expect(pastasPedidas).toEqual([
      `${PASTA_BACKUP}/Arquivos`, `${PASTA_BACKUP}/Arquivos/Fotos de inspeção`, `${PASTA_BACKUP}/Arquivos/Fotos de inspeção/OP-102`,
    ]);
  });

  it("arquivo que sumiu do Blob é falha à vista — e não impede os outros", async () => {
    db.anexos = [
      { id: "d1", opNumero: "102", arquivoUrl: BLOB("sumiu.pdf"), arquivoNome: "a.pdf" },
      { id: "d2", opNumero: "102", arquivoUrl: BLOB("ok.pdf"), arquivoNome: "b.pdf" },
    ];
    const p = await copiarArquivosSemBackup({ enviar, criarPasta, buscar });
    expect(p.anexos).toBe(1);
    expect(p.falhas).toEqual([{ tipo: "anexo", id: "d1", erro: "Blob HTTP 404" }]);
    expect(db.updates.map((u) => u.where.id)).toEqual(["d2"]);
  });

  it("endereço fora do Blob não é buscado (SSRF) — vira falha", async () => {
    db.fotos = [{ id: "f1", opNumero: "102", url: "http://169.254.169.254/latest/meta-data", relatorioId: null }];
    const p = await copiarArquivosSemBackup({ enviar, criarPasta, buscar });
    expect(buscar).not.toHaveBeenCalled();
    expect(p.falhas[0]).toMatchObject({ id: "f1", erro: "endereço fora do Vercel Blob" });
  });

  it("perto do teto de tempo para de copiar e diz quantos ficaram para a próxima noite", async () => {
    db.fotos = Array.from({ length: 5 }, (_, i) => ({ id: `f${i}`, opNumero: "102", url: BLOB(`f${i}.jpg`), relatorioId: null }));
    let t = 0;
    const p = await copiarArquivosSemBackup({ enviar, criarPasta, buscar, agora: () => (t += 100_000), simultaneos: 1 });
    expect(p.adiados).toBeGreaterThan(0);
    expect(p.fotos + p.adiados).toBe(5);
  });
});
