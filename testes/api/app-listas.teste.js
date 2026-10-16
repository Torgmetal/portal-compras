// O app importa LE/LPC pelo token do aparelho e recebe RECIBO (previsto × gravado), não previsão.
// Prisma, parsers e SharePoint são simulados — nenhum teste toca o banco nem o servidor de arquivos.
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/sharepoint-lista", () => ({ salvarListaNoServidor: vi.fn() }));
vi.mock("@/lib/parse-le-form21", () => ({ parseFormularioLE: vi.fn() }));
vi.mock("@/lib/parse-lpc", () => ({ parseLPC: vi.fn() }));
vi.mock("@/lib/importar-lpc-merge", () => ({ importarLpcMerge: vi.fn() }));
import { salvarListaNoServidor } from "@/lib/sharepoint-lista";
import { parseFormularioLE } from "@/lib/parse-le-form21";
import { parseLPC } from "@/lib/parse-lpc";
import { importarLpcMerge } from "@/lib/importar-lpc-merge";
import { POST } from "@/app/api/engenharia-ia/app/listas/route";
import { hashToken } from "@/lib/ia-engenharia";

const TOKEN = "tok-do-pc";
const planilha = () => XLSX.write(
  (() => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["MARCA", "QTD"], ["T89C1", 2]]), "LE"); return wb; })(),
  { type: "base64", bookType: "xlsx" });
const corpo = (extra = {}) => ({ tipo: "LE", opNumero: "89", revisao: "R01", arquivoNome: "089-LE_R01.xlsx", arquivoBase64: planilha(), ...extra });
const pedir = (body = corpo(), headers = { authorization: `Bearer ${TOKEN}` }) =>
  POST(new Request("http://localhost/api/engenharia-ia/app/listas", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }));

const LE = { opNumero: "89", obra: "BRACELL", pecas: [
  { item: 1, marca: "T89C1", qte: 2, pesoUnitKg: 50, pesoTotalKg: 100 },
  { item: 2, marca: "T89C2", qte: 1, pesoUnitKg: 80, pesoTotalKg: 80 },
], qteTotal: 3 };

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.iaAparelho.findUnique.mockImplementation(async ({ where }) => (where.tokenHash === hashToken(TOKEN) ? { id: "ap1", userId: "u1", status: "ATIVO" } : null));
  mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", ativo: true, tipo: "USUARIO", name: "John" });
  mockPrisma.userModulo.findFirst.mockResolvedValue({ id: "m1" });
  parseFormularioLE.mockReturnValue(structuredClone(LE));
  mockPrisma.oP.findUnique.mockResolvedValue(null);
  mockPrisma.oP.findMany.mockResolvedValue([{ id: "op89", numero: "089" }]);
  mockPrisma.pecaConjunto.findMany.mockResolvedValue([]);
  mockPrisma.pecaConjunto.create.mockImplementation(async ({ data }) => ({ id: "n-" + data.marca, ...data }));
  mockPrisma.pecaConjunto.aggregate.mockResolvedValue({ _sum: { pesoTotalKg: 180 } });
  mockPrisma.auditLog.create.mockResolvedValue({});
  salvarListaNoServidor.mockResolvedValue({ webUrl: "https://sp/089-LE_R01.xlsx", nome: "089-LE_R01.xlsx", pastaOp: "OP-089", caminho: "01. OP/OP-089/LE" });
});

describe("acesso e validação", () => {
  it("401 sem token; nada é gravado", async () => {
    expect((await pedir(corpo(), {})).status).toBe(401);
    expect(mockPrisma.pecaConjunto.create).not.toHaveBeenCalled();
  });
  it("tipo fora de LE/LPC → 400", async () => {
    const r = await pedir(corpo({ tipo: "RM" }));
    expect(r.status).toBe(400);
    expect((await r.json()).ok).toBe(false);
  });
  it("revisão fora do formato R00 → 400", async () => {
    expect((await pedir(corpo({ revisao: "1" }))).status).toBe(400);
  });
  it("base64 acima de 4 MB → 413, sem gravar nem arquivar", async () => {
    const r = await pedir(corpo({ arquivoBase64: "A".repeat(4 * 1024 * 1024 + 4) }));
    expect(r.status).toBe(413);
    expect(mockPrisma.pecaConjunto.create).not.toHaveBeenCalled();
    expect(salvarListaNoServidor).not.toHaveBeenCalled();
  });
});

describe("LE", () => {
  it("import perfeito: previsto = gravado, sem alerta, arquivado, AuditLog com o aparelho", async () => {
    const r = await pedir();
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j).toMatchObject({
      ok: true, tipo: "LE", opNumero: "89",
      previsto: { incluidas: 2, alteradas: 0, removidas: 0 },
      gravado: { criados: 2, atualizados: 0, ignorados: 0 },
      divergente: false, alerta: null,
      arquivo: { webUrl: "https://sp/089-LE_R01.xlsx", caminho: "01. OP/OP-089/LE" },
    });
    expect(j.avisoArquivo).toBeUndefined();
    const audit = mockPrisma.auditLog.create.mock.calls.map(([x]) => x.data).find((d) => d.action === "IMPORTAR_LISTA_APP");
    expect(audit).toMatchObject({ userId: "u1", diff: { tipo: "LE", revisao: "R01", aparelhoId: "ap1", previsto: { incluidas: 2 }, gravado: { criados: 2 } } });
  });

  it("recibo diz qual OP foi encontrada e sob que número gravou ('89' → '089')", async () => {
    const j = await (await pedir()).json();
    expect(j).toMatchObject({ opNumero: "89", opEncontrada: true, opCadastrada: "089", chaveGravada: "089" });
  });

  it("OP que não existe no portal → 404 ANTES de gravar ou arquivar", async () => {
    mockPrisma.oP.findMany.mockResolvedValue([{ id: "op90", numero: "090" }]);
    const r = await pedir();
    expect(r.status).toBe(404);
    const j = await r.json();
    expect(j).toEqual({ ok: false, error: "OP 89 não encontrada no portal." });
    expect(parseFormularioLE).not.toHaveBeenCalled();
    expect(mockPrisma.pecaConjunto.create).not.toHaveBeenCalled();
    expect(mockPrisma.pecaConjunto.deleteMany).not.toHaveBeenCalled();
    expect(salvarListaNoServidor).not.toHaveBeenCalled();
  });

  it("OP ambígua pelo número ('089' e 'T89' cadastradas) também é 404 — mesma regra do import da tela", async () => {
    mockPrisma.oP.findMany.mockResolvedValue([{ id: "a", numero: "089" }, { id: "b", numero: "T89" }]);
    expect((await pedir()).status).toBe(404);
    expect(mockPrisma.pecaConjunto.create).not.toHaveBeenCalled();
  });

  it("OP '89' grava sob a OP cadastrada '089'", async () => {
    await pedir();
    const gravadas = mockPrisma.pecaConjunto.create.mock.calls.map(([x]) => x.data);
    expect(gravadas.map((d) => d.opNumero)).toEqual(["089", "089"]);
    expect(gravadas.every((d) => d.opId === "op89")).toBe(true);
    expect(parseFormularioLE.mock.calls[0][1]).toEqual({ opNumeroForcado: "89" });
  });

  it("gravou MENOS que o previsto → divergente, com a frase da tela", async () => {
    mockPrisma.pecaConjunto.create.mockImplementation(async ({ data }) => {
      if (data.marca === "T89C2") throw Object.assign(new Error("unique"), { code: "P2002" });
      return { id: "n", ...data };
    });
    const j = await (await pedir()).json();
    expect(j.previsto.incluidas).toBe(2);
    expect(j.gravado).toEqual({ criados: 1, atualizados: 0, ignorados: 1 });
    expect(j.divergente).toBe(true);
    expect(j.alerta).toContain("1 NÃO entrou");
  });

  it("sobrescrever: o esperado é o arquivo inteiro (criadas + atualizadas), sem alarme falso", async () => {
    mockPrisma.pecaConjunto.findMany.mockImplementation(async ({ where }) =>
      where.fonte === "LE_IMPORT" ? [] : [{ id: "lpc-c2", marca: "T89C2" }]); // a LPC já tem a T89C2
    const j = await (await pedir(corpo({ sobrescrever: true }))).json();
    expect(j.gravado).toEqual({ criados: 1, atualizados: 1, ignorados: 0 });
    expect(j.divergente).toBe(false);
    expect(mockPrisma.pecaConjunto.deleteMany).toHaveBeenCalled();
  });

  it("SharePoint fora do ar: ok:true com avisoArquivo — o banco não é desfeito", async () => {
    salvarListaNoServidor.mockRejectedValue(new Error("Não achei a pasta da OP 89 no servidor."));
    const r = await pedir();
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.ok).toBe(true);
    expect(j.arquivo).toBeNull();
    expect(j.avisoArquivo).toContain("Não achei a pasta da OP 89");
    expect(j.gravado.criados).toBe(2);
    expect(mockPrisma.pecaConjunto.deleteMany).not.toHaveBeenCalled();
  });

  it("revisão R01 arquiva com a aba Revisao (Previsto/Gravado); R00 arquiva como veio", async () => {
    await pedir();
    const wb = XLSX.read(salvarListaNoServidor.mock.calls[0][0].buffer, { type: "buffer" });
    expect(wb.SheetNames).toContain("Revisao");
    const aba = XLSX.utils.sheet_to_json(wb.Sheets.Revisao, { header: 1 });
    expect(aba.find((l) => l[0] === "Gravado (o que foi ao banco)")[1]).toContain("2 criadas");

    salvarListaNoServidor.mockClear();
    await pedir(corpo({ revisao: "R00" }));
    expect(XLSX.read(salvarListaNoServidor.mock.calls[0][0].buffer, { type: "buffer" }).SheetNames).toEqual(["LE"]);
  });
});

describe("LPC", () => {
  const merge = (extra = {}) => ({
    opNumero: "T89A", obra: "BRACELL", adicionadas: ["T89A-1", "T89A-2"], removidas: ["T89A-9"], alteradas: ["T89A-3"],
    mantidas: 1, conflitos: [], totalNovo: 3, gravado: { criados: 2, atualizados: 1, removidos: 1 }, ...extra,
  });
  beforeEach(() => {
    parseLPC.mockImplementation((rows, { opNumeroForcado }) => ({ opNumero: opNumeroForcado, conjuntos: [], croquis: [], avulsas: [], relacoes: [] }));
  });

  it("a chave é a fase do nome do arquivo, não o número da OP; recibo vem do que o merge gravou", async () => {
    importarLpcMerge.mockResolvedValue(merge());
    const j = await (await pedir(corpo({ tipo: "LPC", arquivoNome: "T89A-LPC_R02.xlsx", revisao: "R02" }))).json();
    expect(parseLPC.mock.calls[0][1]).toEqual({ opNumeroForcado: "T89A" });
    expect(importarLpcMerge.mock.calls[0][1]).toEqual({ userId: "u1", revisao: 2, arquivo: "T89A-LPC_R02.xlsx" });
    expect(j).toMatchObject({
      ok: true, tipo: "LPC",
      previsto: { incluidas: 2, alteradas: 1, removidas: 1 },
      gravado: { criados: 2, atualizados: 1, ignorados: 0 },
      divergente: false, alerta: null,
    });
    expect(salvarListaNoServidor.mock.calls[0][0]).toMatchObject({ tipo: "LPC", opNumero: "89", fileNome: "T89A-LPC_R02.xlsx" });
  });

  it("createMany pulou marca (skipDuplicates) → divergente", async () => {
    importarLpcMerge.mockResolvedValue(merge({ gravado: { criados: 1, atualizados: 1, removidos: 1 } }));
    const j = await (await pedir(corpo({ tipo: "LPC", arquivoNome: "T89A-LPC_R02.xlsx" }))).json();
    expect(j.gravado).toEqual({ criados: 1, atualizados: 1, ignorados: 1 });
    expect(j.divergente).toBe(true);
    expect(j.alerta).toContain("1 NÃO entrou");
  });

  it("recibo da LPC diz a OP cadastrada e a chave da fase gravada", async () => {
    importarLpcMerge.mockResolvedValue(merge({ opEncontrada: true, opCadastrada: "089" }));
    const j = await (await pedir(corpo({ tipo: "LPC", arquivoNome: "T89A-LPC_R02.xlsx" }))).json();
    expect(j).toMatchObject({ opEncontrada: true, opCadastrada: "089", chaveGravada: "T89A" });
  });

  it("parser devolveu o número da OP no lugar da fase ('089') → 400, nada gravado", async () => {
    parseLPC.mockReturnValue({ opNumero: "089", conjuntos: [], croquis: [], avulsas: [], relacoes: [] });
    const r = await pedir(corpo({ tipo: "LPC", arquivoNome: "089-LPC_R02.xlsx" }));
    expect(r.status).toBe(400);
    const j = await r.json();
    expect(j.error).toContain("fase");
    expect(j.error).toContain("T94A");
    expect(importarLpcMerge).not.toHaveBeenCalled();
    expect(salvarListaNoServidor).not.toHaveBeenCalled();
  });

  it("fase de OUTRA OP (T094A para a OP 89) → 400, nada gravado", async () => {
    const r = await pedir(corpo({ tipo: "LPC", arquivoNome: "T094A-LPC_R02.xlsx" }));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toContain("T094A");
    expect(importarLpcMerge).not.toHaveBeenCalled();
    expect(salvarListaNoServidor).not.toHaveBeenCalled();
  });

  it("fase com zero à esquerda da MESMA OP (T089A para a OP 89) passa", async () => {
    importarLpcMerge.mockResolvedValue(merge({ opNumero: "T089A" }));
    const r = await pedir(corpo({ tipo: "LPC", opNumero: "089", arquivoNome: "T089A-LPC_R02.xlsx" }));
    expect(r.status).toBe(200);
    expect(importarLpcMerge).toHaveBeenCalled();
  });

  it("LPC com sobrescrever:true → 400, nada lido nem gravado", async () => {
    const r = await pedir(corpo({ tipo: "LPC", arquivoNome: "T89A-LPC_R02.xlsx", sobrescrever: true }));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toContain("a LPC pelo app só entra em modo complementar");
    expect(parseLPC).not.toHaveBeenCalled();
    expect(importarLpcMerge).not.toHaveBeenCalled();
  });

  it("sem fase no arquivo nem nas marcas → 400, nunca grava sob o número da OP", async () => {
    parseLPC.mockReturnValue({ opNumero: null, conjuntos: [], croquis: [], avulsas: [], relacoes: [] });
    const r = await pedir(corpo({ tipo: "LPC", arquivoNome: "lista.xlsx" }));
    expect(r.status).toBe(400);
    expect(parseLPC.mock.calls[0][1]).toEqual({ opNumeroForcado: null });
    expect(importarLpcMerge).not.toHaveBeenCalled();
    expect(salvarListaNoServidor).not.toHaveBeenCalled();
  });
});
