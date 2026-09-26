import { describe, it, expect, vi, afterEach } from "vitest";
import { listarLqcs, varrerPastasDeLqc, PASTA_DO_ANO } from "@/lib/lqc-sharepoint";

// ⚠⚠ `root/search(q='LQC')` devolve HTTP 500 neste drive desde 22–23/09/2026 e deixou o cron
// `lqc-sharepoint` 65 h sem sucesso. A troca foi listar as pastas de orçamento, porque a estrutura
// é regular: `{grupo}/{pasta do orçamento}/5.Estudos/LQC-*.xlsx`.

const json = (corpo, status = 200) => ({ ok: status < 400, status, json: async () => corpo, headers: { get: () => null } });
const arq = (name, extra = {}) => ({ id: name, name, file: {}, size: 100, lastModifiedDateTime: "2026-09-01T00:00:00Z", ...extra });
const pasta = (name) => ({ id: name, name, folder: {} });

const RAIZ = `/Comercial/1. Orçamento/${PASTA_DO_ANO(2026)}`;
const rotear = (mapa) => vi.fn(async (url) => {
  for (const [caminho, itens] of Object.entries(mapa)) {
    if (url.includes(encodeURI(caminho) + ":/children")) return json({ value: itens });
  }
  return json({ error: { code: "itemNotFound", message: "nada" } }, 404);
});
const deps = (mapa) => ({ get: rotear(mapa), driveId: "d" });

afterEach(() => { delete process.env.SHAREPOINT_ORCAMENTOS_BASE; });

const ARVORE = {
  [RAIZ]: [pasta("1. Solicitados"), pasta("2. Concluidos")],
  [`${RAIZ}/1. Solicitados`]: [pasta("25_09 - HTB-COLEGIO - VITOR")],
  [`${RAIZ}/2. Concluidos`]: [pasta("250-26-MARKO-ZOLVER-VIGAS")],
  // ⚠ obra em andamento: sem `5.Estudos`, com a LQC solta no nível da pasta
  [`${RAIZ}/1. Solicitados/25_09 - HTB-COLEGIO - VITOR`]: [arq("LQC-038-26-HTB-COLÉGIO-TORG-R01.xlsx")],
  [`${RAIZ}/2. Concluidos/250-26-MARKO-ZOLVER-VIGAS`]: [
    pasta("1.Emails"), pasta("5.Estudos"), pasta("6.Propostas"),
  ],
  [`${RAIZ}/2. Concluidos/250-26-MARKO-ZOLVER-VIGAS/5.Estudos`]: [
    arq("LQC-250-26-MARKO-ZOLVER-VIGAS-TORG-R00.xlsx"),
  ],
};

describe("varrerPastasDeLqc", () => {
  it("⚠⚠ olha OS DOIS níveis: a LQC em 5.Estudos e a solta no nível da pasta do orçamento", async () => {
    // Medido em 26/09: 4 LQC estão soltas no nível da pasta. Olhar só `5.Estudos` perderia as quatro.
    const r = await varrerPastasDeLqc(2026, deps(ARVORE));
    expect(r.arquivos.map((a) => a.nome).sort()).toEqual([
      "LQC-038-26-HTB-COLÉGIO-TORG-R01.xlsx",
      "LQC-250-26-MARKO-ZOLVER-VIGAS-TORG-R00.xlsx",
    ]);
  });

  it("pasta sem 5.* é RELATADA, não silenciada", async () => {
    const r = await varrerPastasDeLqc(2026, deps(ARVORE));
    expect(r.semEstudos).toEqual(["1. Solicitados/25_09 - HTB-COLEGIO - VITOR"]);
  });

  it("⚠ não entra em 6.Propostas — a varredura para no 5.Estudos, e é isso que segura a cota", async () => {
    const d = deps(ARVORE);
    await varrerPastasDeLqc(2026, d);
    const visitou = (c) => d.get.mock.calls.some(([u]) => u.includes(encodeURI(c) + ":/children"));
    expect(visitou(`${RAIZ}/2. Concluidos/250-26-MARKO-ZOLVER-VIGAS/5.Estudos`)).toBe(true);
    expect(visitou(`${RAIZ}/2. Concluidos/250-26-MARKO-ZOLVER-VIGAS/6.Propostas`)).toBe(false);
    // 1 raiz + 2 grupos + 2 orçamentos + 1 estudos
    expect(d.get).toHaveBeenCalledTimes(6);
  });

  it("⚠ pasta que falha derruba a varredura — parcial faria a obra parecer sem LQC", async () => {
    const get = vi.fn(async (url) => (url.includes(encodeURI(`${RAIZ}/2. Concluidos`) + ":/children")
      ? json({ error: { code: "serviceNotAvailable", message: "caiu" } }, 503)
      : json({ value: ARVORE[RAIZ] })));
    await expect(varrerPastasDeLqc(2026, { get, driveId: "d" })).rejects.toThrow(/HTTP 503/);
  });

  it("a pasta do ano não existir é erro nomeado, não lista vazia", async () => {
    await expect(varrerPastasDeLqc(2026, deps({}))).rejects.toThrow(/ORÇAMENTOS_2026.*não existe/);
  });
});

describe("listarLqcs", () => {
  it("lê número, ano e revisão do nome, e guarda onde achou", async () => {
    const { lqcs } = await listarLqcs(2026, deps(ARVORE));
    const m = lqcs.find((l) => l.numero === 250);
    expect(m).toMatchObject({ numero: 250, ano: 26, revisao: 0 });
    expect(m.caminho).toContain("5.Estudos");
    expect(lqcs.map((l) => l.numero).sort((a, b) => a - b)).toEqual([38, 250]);
  });

  it("⚠⚠ a MESMA LQC em duas pastas conta UMA vez — o de-dup é pelo id do drive", async () => {
    // Medido: a LQC-295-26 está em "1. Solicitados" e em "2. Concluidos" ao mesmo tempo, porque a
    // cópia velha fica para trás quando a obra muda de grupo.
    const mesmo = { ...arq("LQC-295-26-DANPOWER-ENC0337-TORG-R01.xlsx"), id: "item-295" };
    const { lqcs } = await listarLqcs(2026, deps({
      [RAIZ]: [pasta("1. Solicitados"), pasta("2. Concluidos")],
      [`${RAIZ}/1. Solicitados`]: [pasta("24_09 - DANPOWER-REVISÃO")],
      [`${RAIZ}/2. Concluidos`]: [pasta("295-26-DANPOWER-ENC0337")],
      [`${RAIZ}/1. Solicitados/24_09 - DANPOWER-REVISÃO`]: [mesmo],
      [`${RAIZ}/2. Concluidos/295-26-DANPOWER-ENC0337`]: [mesmo],
    }));
    expect(lqcs).toHaveLength(1);
  });

  it("descarta o modelo em branco, outro ano e o arquivo de trava do Excel; relata o fora do padrão", async () => {
    const { lqcs, ignorados } = await listarLqcs(2026, deps({
      [RAIZ]: [pasta("2. Concluidos")],
      [`${RAIZ}/2. Concluidos`]: [pasta("000-26-CLIENTE-OBRA")],
      [`${RAIZ}/2. Concluidos/000-26-CLIENTE-OBRA`]: [
        arq("LQC-000-00-CLIENTE-OBRA-TORG-R00.xlsx"),
        arq("LQC-283-25-BERMER-AENA-TORG-R00.xlsx"),
        arq("~$LQC-311-26-RIDARP-UNILEVER-TORG-R01.xlsx"),
        arq("LQC do cliente.xlsx"),
        arq("proposta.pdf"),
      ],
    }));
    expect(lqcs).toEqual([]);
    expect(ignorados.map((i) => i.nome)).toEqual(["LQC do cliente.xlsx"]);
  });

  it("respeita SHAREPOINT_ORCAMENTOS_BASE", async () => {
    process.env.SHAREPOINT_ORCAMENTOS_BASE = "/Outro/Lugar/";
    const raiz = `/Outro/Lugar/${PASTA_DO_ANO(2026)}`;
    const { lqcs } = await listarLqcs(2026, deps({
      [raiz]: [pasta("2. Concluidos")],
      [`${raiz}/2. Concluidos`]: [pasta("007-26-CASP-VIGAS")],
      [`${raiz}/2. Concluidos/007-26-CASP-VIGAS`]: [arq("LQC-007-26-CASP-VIGAS-TORG-R00.xlsx")],
    }));
    expect(lqcs.map((l) => l.numero)).toEqual([7]);
  });
});
