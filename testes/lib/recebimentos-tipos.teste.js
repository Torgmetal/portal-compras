// Os dois recebimentos novos (07/10/2026) como TIPOS de relatório: numeração, título, seção do data book,
// escopo da obra, trava de assinatura e o que as duas rotas gravam. Um tipo novo que esquece um destes
// pontos fica com metade do comportamento — foi assim que sais/poeira caíram nos controles do EVS no celular.
import { describe, it, expect } from "vitest";
import {
  TIPO, codigoRelatorio, tituloDocumento, semJunta, resultadosDaTela, pendenciasParaAssinatura,
} from "@/lib/qualidade-campo";
import { escopoDaOP, tipoNoEscopo, TIPOS_ESCOPAVEIS, secoesForaDoEscopo } from "@/lib/qualidade-escopo";
import { limparResultadosSuperficie, TIPOS_GRAVACAO_PROPRIA } from "@/lib/superficie-gravacao";
import { condicoesDoRelatorio } from "@/lib/campo-condicoes";

describe("numeração e título", () => {
  it("RRP e RRA, na §12 do data book", () => {
    expect(TIPO.RECEBIMENTO_PENETRANTE).toMatchObject({ sigla: "RRP", secao: "12", label: "Recebimento de penetrante e revelador" });
    expect(TIPO.RECEBIMENTO_ARAME).toMatchObject({ sigla: "RRA", secao: "12", label: "Recebimento de arame de solda" });
    expect(codigoRelatorio("RECEBIMENTO_ARAME", "102", 1)).toBe("RRA-102-001");
    expect(tituloDocumento("RECEBIMENTO_PENETRANTE")).toBe("RELATÓRIO DE INSPEÇÃO DE RECEBIMENTO DE PENETRANTE E REVELADOR");
    expect(tituloDocumento("RECEBIMENTO_ARAME")).toBe("RELATÓRIO DE INSPEÇÃO DE RECEBIMENTO DE ARAME DE SOLDA");
  });

  it("sem junta e sem REC, como o recebimento de tintas", () => {
    for (const t of ["RECEBIMENTO_PENETRANTE", "RECEBIMENTO_ARAME"]) {
      expect(semJunta(t)).toBe(true);
      expect(resultadosDaTela(t, null)).toEqual(["APROVADO", "REPROVADO"]);
    }
  });

  it("a trava de assinatura é a do recebimento por certificado", () => {
    const rel = { tipo: "RECEBIMENTO_ARAME", resultados: { itens: [] } };
    expect(pendenciasParaAssinatura(rel).join(" ")).toMatch(/certificados do CMR/);
  });
});

describe("escopo da obra", () => {
  it("acompanham o ensaio que usa o material: penetrante com o LP, arame com o visual de solda", () => {
    const op = { escopoQualidade: { tipos: ["DIMENSIONAL", "VISUAL_SOLDA"] } };
    expect(tipoNoEscopo(op, "RECEBIMENTO_ARAME")).toBe(true);
    expect(tipoNoEscopo(op, "RECEBIMENTO_PENETRANTE")).toBe(false);
    expect(tipoNoEscopo({ escopoQualidade: { tipos: ["LP"] } }, "RECEBIMENTO_PENETRANTE")).toBe(true);
  });

  it("não viram caixa própria no escopo (o Completo salvo continua Completo)", () => {
    const ids = TIPOS_ESCOPAVEIS.map((t) => t.id);
    expect(ids).not.toContain("RECEBIMENTO_PENETRANTE");
    expect(ids).not.toContain("RECEBIMENTO_ARAME");
  });

  it("obra sem escopo definido oferece tudo, inclusive os dois", () => {
    expect(escopoDaOP({ escopoQualidade: null }).tipos).toEqual(expect.arrayContaining(["RECEBIMENTO_PENETRANTE", "RECEBIMENTO_ARAME"]));
  });

  it("não mudam as seções que nascem N/A", () => {
    expect(secoesForaDoEscopo({ escopoQualidade: { tipos: ["DIMENSIONAL"] } })).toContain("12");
  });
});

describe("o que as rotas gravam", () => {
  it("os itens passam pela regra única das duas rotas", () => {
    expect(TIPOS_GRAVACAO_PROPRIA).toEqual(expect.arrayContaining(["RECEBIMENTO_PENETRANTE", "RECEBIMENTO_ARAME"]));
    const out = limparResultadosSuperficie({
      itens: [{ descricao: "ARAME MIG", visual: "a", dimensional: "N.A.", documentos: "R", docId: "d1", r: "260005" }],
      localAplicacao: "Galpão 2", dataInspecao: "2026-10-07", lotes: [{ lote: "x" }],
    }, "RECEBIMENTO_ARAME");
    expect(out.itens[0]).toMatchObject({ descricao: "ARAME MIG", visual: "A", dimensional: "NA", documentos: "R", docId: "d1", r: "260005" });
    expect(out.localAplicacao).toBe("Galpão 2");
    expect(out.dataInspecao).toBe("2026-10-07");
    expect(out.lotes).toBeUndefined(); // o celular manda as chaves da família inteira: o que não é do tipo fica fora
  });

  it("o recebimento de tintas não ganha itens de outro modelo", () => {
    expect(limparResultadosSuperficie({ itens: [{ descricao: "x" }] }, "RECEBIMENTO_TINTA").itens).toBeUndefined();
  });

  it("o celular carrega e devolve os itens", () => {
    expect(condicoesDoRelatorio({ itens: [{ descricao: "ARAME" }] }).itens).toEqual([{ descricao: "ARAME" }]);
    expect(condicoesDoRelatorio({}).itens).toEqual([]);
    expect(condicoesDoRelatorio({ localAplicacao: "Galpão 2" }).localAplicacao).toBe("Galpão 2");
  });
});
