// As abas da planilha do Syneco: resumo + uma por setor, porque quem lança trabalha setor a setor.
// Vitor (18/09/2026): "gere na planilha as peças que estão faltando apontamentos das ops que
// estamos fazendo".
import { describe, expect, it } from "vitest";
import { planilhaApontamentos, ORDEM_SETORES } from "@/lib/apontamentos-syneco-planilha";

const atras = (setorSyneco, opNumero, marca, aLancar = 1, pesoALancarKg = 10) => ({
  setorSyneco, opNumero, obra: `OBRA ${opNumero}`, obraSyneco: `T${opNumero}`, marca,
  descricao: "CONJUNTO", apontado: 0, aLancar, pesoALancarKg, prova: "Pintura tem 2 apontada(s)",
});
const doPortal = { setorSyneco: "Corte", obraSyneco: "T89A", opNumero: "089", marca: "T89A-P1", descricao: "CHAPA", perfil: "CH8", qte: 2, noPortal: 2, noSyneco: 0, aLancar: 2, pesoALancarKg: 4, baixadoPor: "Larissa" };

const nomes = (p) => p.abas.map((a) => a.nome);

describe("planilhaApontamentos", () => {
  it("abre no resumo e traz uma aba por setor, na ordem da fábrica", () => {
    const p = planilhaApontamentos({ atras: [atras("Jato", "083", "A1"), atras("Preparação", "083", "A2"), atras("Corte", "067", "B1")] });
    expect(nomes(p)).toEqual(["Resumo", "Corte", "Preparacao", "Jato"]);
  });

  it("setor sem linha não vira aba vazia", () => {
    const p = planilhaApontamentos({ atras: [atras("Jato", "083", "A1")] });
    expect(nomes(p)).toEqual(["Resumo", "Jato"]);
    expect(nomes(p)).not.toContain("Montagem");
  });

  it("o resumo conta por OP e por setor, com peças e peso", () => {
    const p = planilhaApontamentos({ atras: [atras("Jato", "083", "A1", 2, 10), atras("Jato", "083", "A2", 3, 5), atras("Corte", "067", "B1", 1, 7)] });
    const resumo = p.abas[0];
    expect(resumo.headers).toEqual(["OP", "Obra", "Corte", "Jato", "Lançamentos", "Peças", "Peso (kg)"]);
    // OP 067: 1 no corte, nada no jato · OP 083: 2 no jato
    expect(resumo.linhas).toEqual([
      ["067", "OBRA 067", 1, "", 1, 1, 7],
      ["083", "OBRA 083", "", 2, 2, 5, 15],
    ]);
  });

  it("a aba do setor leva a prova do apontamento à frente", () => {
    const p = planilhaApontamentos({ atras: [atras("Solda", "089", "T89A1")] });
    const aba = p.abas.find((a) => a.nome === "Solda");
    expect(aba.headers).toContain("Prova (apontamento à frente)");
    expect(aba.linhas[0]).toEqual(["089", "T089", "T89A1", "CONJUNTO", 0, 1, 10, "Pintura tem 2 apontada(s)"]);
  });

  it("a baixa do portal vira aba própria, e só quando existe", () => {
    expect(nomes(planilhaApontamentos({ atras: [atras("Jato", "083", "A1")], portal: [doPortal] }))).toEqual(["Resumo", "Jato", "Baixa do portal"]);
    expect(nomes(planilhaApontamentos({ atras: [atras("Jato", "083", "A1")] }))).not.toContain("Baixa do portal");
  });

  it("sem nada a lançar, a planilha diz isso em vez de sair vazia", () => {
    const p = planilhaApontamentos({});
    expect(nomes(p)).toEqual(["Nada a lançar"]);
    expect(p.abas[0].subtitulo).toMatch(/em dia/);
  });

  it("nome de aba sai sem acento e dentro do teto do Excel", () => {
    for (const s of ORDEM_SETORES) {
      const p = planilhaApontamentos({ atras: [atras(s, "083", "A1")] });
      const aba = p.abas[1];
      expect(aba.nome.length).toBeLessThanOrEqual(31);
      expect(aba.nome).toMatch(/^[\w ]+$/);
    }
  });
});
