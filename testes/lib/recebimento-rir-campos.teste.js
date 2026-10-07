// Regras do recebimento por certificado (penetrante/revelador e arame de solda): uma linha por
// certificado, com inspeção visual, dimensional e de documentação marcadas A, R ou N.A.
// Vitor (07/10/2026): o modelo de RIR do cliente serve "apenas para saber as informações necessárias";
// o documento é da Torg.
import { describe, it, expect } from "vitest";
import {
  INSPECOES_RIR, itensRir, resultadoExigidoRir, pendenciasRir, avisosRir, rotuloMarca, limparItensRir, N_ITENS_RIR,
} from "@/lib/recebimento-rir-campos";

const item = (extra = {}) => ({ descricao: "ARAME DE SOLDA MIG ER70S-6 1,2 MM", nf: "81288", certificado: "99005530", lote: "C-1", quantidade: "2.160 kg", visual: "A", dimensional: "NA", documentos: "A", ...extra });
const rel = (itens, extra = {}) => ({ tipo: "RECEBIMENTO_ARAME", resultados: { itens, dataInspecao: "2026-10-07" }, createdAt: "2026-10-07T12:00:00Z", ...extra });

describe("as três inspeções de cada item", () => {
  it("visual, dimensional e documentação, como no modelo", () => {
    expect(INSPECOES_RIR.map((i) => i.k)).toEqual(["visual", "dimensional", "documentos"]);
    expect(rotuloMarca("NA")).toBe("N.A.");
    expect(rotuloMarca("A")).toBe("A");
    expect(rotuloMarca("")).toBe("");
  });

  it("itens gravados saem normalizados (marca inválida vira em branco)", () => {
    const [i] = itensRir({ itens: [item({ visual: "x", documentos: "r" })] });
    expect(i.visual).toBe("");
    expect(i.documentos).toBe("R");
    expect(i.numero).toBe(1);
  });
});

describe("o resultado que os itens exigem", () => {
  it("tudo A ou N.A. → APROVADO", () => {
    expect(resultadoExigidoRir(rel([item(), item({ visual: "A", dimensional: "A" })]))).toBe("APROVADO");
  });
  it("qualquer R → REPROVADO", () => {
    expect(resultadoExigidoRir(rel([item(), item({ documentos: "R" })]))).toBe("REPROVADO");
  });
  it("validade vencida na data do recebimento → REPROVADO", () => {
    expect(resultadoExigidoRir(rel([item({ validade: "2026-09-30" })]))).toBe("REPROVADO");
  });
  it("falta marcar → ainda sem resultado", () => {
    expect(resultadoExigidoRir(rel([item({ visual: "" })]))).toBe("");
    expect(resultadoExigidoRir(rel([]))).toBe("");
  });
});

describe("o que falta para assinar", () => {
  it("relatório completo e aprovado não tem pendência", () => {
    expect(pendenciasRir(rel([item()], { resultadoInspecao: "APROVADO" }))).toEqual([]);
  });

  it("sem item nenhum, diz como incluir", () => {
    expect(pendenciasRir(rel([], { resultadoInspecao: "APROVADO" })).join(" ")).toMatch(/certificado/i);
  });

  it("aponta os itens sem marcação e sem descrição", () => {
    const p = pendenciasRir(rel([item(), item({ descricao: "", dimensional: "" })], { resultadoInspecao: "APROVADO" })).join(" ");
    expect(p).toMatch(/item 2 sem descrição/i);
    expect(p).toMatch(/itens: 2/);
  });

  it("aprovado com item reprovado não fecha", () => {
    expect(pendenciasRir(rel([item({ visual: "R" })], { resultadoInspecao: "APROVADO" })).join(" ")).toMatch(/REPROVADO/);
  });

  it("reprovado sem nada reprovado pede o motivo nas observações — e com o motivo, fecha", () => {
    expect(pendenciasRir(rel([item()], { resultadoInspecao: "REPROVADO" })).join(" ")).toMatch(/observações/);
    expect(pendenciasRir(rel([item()], { resultadoInspecao: "REPROVADO", observacoes: "Embalagem sem identificação do lote." }))).toEqual([]);
  });

  it("REC não se aplica a recebimento", () => {
    expect(pendenciasRir(rel([item()], { resultadoInspecao: "REC" })).join(" ")).toMatch(/REC/);
  });
});

describe("avisos que não travam", () => {
  it("item sem nº de certificado avisa (há eletrodo com certificado N/A no CMR)", () => {
    expect(avisosRir(rel([item({ certificado: "" })])).join(" ")).toMatch(/item 1 sem nº de certificado/i);
  });
});

describe("o que se grava", () => {
  it("só os campos do item, com teto de tamanho, marcas válidas e no máximo N itens", () => {
    const sujo = [{ ...item(), visual: "a", hack: "x", descricao: "y".repeat(500), validade: "2026-02-30" }];
    const [l] = limparItensRir(sujo);
    expect(l.visual).toBe("A");
    expect(l.hack).toBeUndefined();
    expect(l.descricao.length).toBe(200);
    expect(l.validade).toBeNull();
    expect(limparItensRir(Array.from({ length: N_ITENS_RIR + 5 }, () => item()))).toHaveLength(N_ITENS_RIR);
    expect(limparItensRir("não é lista")).toEqual([]);
  });
});
