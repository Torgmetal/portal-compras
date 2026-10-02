// ⚠⚠ AS DUAS ROTAS DE GRAVAÇÃO (computador e celular) SÓ GUARDAM O QUE ESTÁ NUMA LISTA FECHADA — campo
// fora dela é descartado em silêncio. Os relatórios de sais e de poeira (02/10/2026) passam por UMA
// regra de limpeza, usada pelas duas rotas, para nenhum campo do modelo voltar em branco.
import { describe, it, expect } from "vitest";
import { limparResultadosSuperficie, CAMPOS_TEXTO_SUPERFICIE } from "@/lib/superficie-gravacao";
import { CAMPOS_CABECALHO_SAIS } from "@/lib/sais-campos";
import { CAMPOS_CABECALHO_POEIRA } from "@/lib/poeira-campos";

describe("gravação dos relatórios de sais e poeira", () => {
  it("todo campo do cabeçalho dos dois modelos é gravável", () => {
    for (const c of [...CAMPOS_CABECALHO_SAIS, ...CAMPOS_CABECALHO_POEIRA]) expect(CAMPOS_TEXTO_SUPERFICIE, c.k).toContain(c.k);
    expect(CAMPOS_TEXTO_SUPERFICIE).toContain("classificacao");
  });

  it("grava as amostras de sais como lista, com no máximo cinco, e só os campos da amostra", () => {
    const r = limparResultadosSuperficie({
      etapaPintura: "Após o jateamento",
      amostras: [
        { condAgua: "1,2", condAmostra: "11", densidade: "", hora: "09:10", lixo: "x" },
        null, {}, {}, {}, { condAgua: "9" },
      ],
    });
    expect(r.etapaPintura).toBe("Após o jateamento");
    expect(r.amostras).toHaveLength(5);
    expect(r.amostras[0]).toEqual({ condAgua: "1,2", condAmostra: "11", densidade: null, hora: "09:10" });
    expect(r.amostras[1]).toEqual({ condAgua: null, condAmostra: null, densidade: null, hora: null });
  });

  it("grava os testes de poeira (A a E) com classe só de 0 a 5", () => {
    const r = limparResultadosSuperficie({
      testes: [{ local: "Alma", quantidade: "2", tamanho: "7", obs: "ok" }, { local: "Mesa", quantidade: 1, tamanho: "0" }],
    });
    expect(r.testes[0]).toEqual({ local: "Alma", quantidade: "2", tamanho: null, obs: "ok" });
    expect(r.testes[1]).toEqual({ local: "Mesa", quantidade: "1", tamanho: "0", obs: null });
  });

  it("não toca em campo que não veio (o que já estava gravado fica)", () => {
    const r = limparResultadosSuperficie({ requisito: "20" });
    expect(Object.keys(r)).toEqual(["requisito"]);
  });

  it("a relação de peças cabe inteira (até 500), o resto dos textos até 120", () => {
    const longa = Array.from({ length: 40 }, (_, i) => `T112A${i + 1}`).join(", ");
    const r = limparResultadosSuperficie({ peca: longa, aparelho: "x".repeat(300) });
    expect(r.peca).toBe(longa);
    expect(r.aparelho).toHaveLength(120);
  });

  it("a data do ensaio só entra como data de verdade (aaaa-mm-dd) — texto livre viraria \"Invalid Date\" no PDF", () => {
    expect(limparResultadosSuperficie({ dataInspecao: "2026-10-01" }).dataInspecao).toBe("2026-10-01");
    expect(limparResultadosSuperficie({ dataInspecao: "ontem" }).dataInspecao).toBeNull();
    expect(limparResultadosSuperficie({ dataInspecao: "" }).dataInspecao).toBeNull();
  });
});
