import { describe, it, expect } from "vitest";
import { extractText } from "unpdf";
import { numerarPorEvidencia, legendaDaFoto } from "@/lib/fotos-evidencia";
import { gerarPinturaPDF } from "@/lib/relatorio-pintura-pdf";

// A NUMERAÇÃO DAS FOTOS DO RELATÓRIO DE PINTURA.
//
// Vitor (22/09/2026): "as fotos estão ficando com marcação errada, temos duas fotos 102-002 ele
// marcar 1/8 2/8". No RIP-102-002 a moldura da folha 2 dizia "Medição de Espessura · 1 de 8" e as
// outras SETE fotos do mesmo ensaio saíam na folha de registro sem número nenhum — e com a legenda
// repetindo o nome do ensaio ("Medição de Espessura · Medição de Espessura"). O documento prometia
// uma contagem que nunca completava.

const fotosDe = (ensaio, n, obs = null) =>
  Array.from({ length: n }, (_, i) => ({ id: `${ensaio}-${i}`, evidencia: ensaio, observacao: obs }));

describe("numeração das fotos por ensaio", () => {
  it("numera DENTRO do ensaio, não no total do relatório", () => {
    const lista = numerarPorEvidencia("PINTURA", [...fotosDe("rugosidade", 2), ...fotosDe("espessura", 8)]);
    const legendas = lista.map((f) => f.legenda);
    expect(legendas.slice(0, 2)).toEqual([
      "Rugosidade / Jateamento · 1 de 2",
      "Rugosidade / Jateamento · 2 de 2",
    ]);
    expect(legendas[2]).toBe("Medição de Espessura · 1 de 8");
    expect(legendas[9]).toBe("Medição de Espessura · 8 de 8");
  });

  it("não repete o nome do ensaio quando a legenda do inspetor é o próprio nome", () => {
    const [a] = numerarPorEvidencia("PINTURA", fotosDe("espessura", 1, "Medição de Espessura"));
    expect(a.legenda).toBe("Medição de Espessura");
    // "Rugosidade" está contido em "Rugosidade / Jateamento" — é a mesma informação
    const [b] = numerarPorEvidencia("PINTURA", fotosDe("rugosidade", 1, "Rugosidade"));
    expect(b.legenda).toBe("Rugosidade / Jateamento");
  });

  it("mantém a legenda do inspetor quando ela diz algo a mais", () => {
    const lista = numerarPorEvidencia("PINTURA", [
      { id: "a", evidencia: "espessura", observacao: null },
      { id: "b", evidencia: "espessura", observacao: "bolha na chapa" },
    ]);
    expect(lista[1].legenda).toBe("Medição de Espessura · 2 de 2 · bolha na chapa");
  });

  it("foto sem ensaio continua com a legenda do inspetor, sem número inventado", () => {
    const [f] = numerarPorEvidencia("PINTURA", [{ id: "x", evidencia: null, observacao: "peça pronta" }]);
    expect(f.legenda).toBe("peça pronta");
    expect(legendaDaFoto("PINTURA", { evidencia: null }, 1, 3)).toBe(null);
  });

  it("um ensaio com uma foto só não ganha '1 de 1'", () => {
    const [f] = numerarPorEvidencia("PINTURA", fotosDe("pullOff", 1));
    expect(f.legenda).toBe("Aderência - Pull Off");
  });
});

it("o PDF numera todas as fotos do ensaio, nas duas folhas", async () => {
  const fotos = [...fotosDe("rugosidade", 2, "Rugosidade"), ...fotosDe("espessura", 8, "Medição de Espessura")];
  const pdf = await gerarPinturaPDF({ rel: { codigo: "RIP-102-002", opNumero: "102", revisao: 0, resultados: {} }, fotos });
  const { text } = await extractText(new Uint8Array(pdf), { mergePages: true });
  const limpo = text.replace(/\s+/g, " ");
  for (let i = 1; i <= 8; i++) expect(limpo).toContain(`Medição de Espessura · ${i} de 8`);
  expect(limpo).toContain("Rugosidade / Jateamento · 2 de 2");
  // ⚠ era isto que saía sete vezes na folha de registro fotográfico
  expect(limpo).not.toContain("Medição de Espessura · Medição de Espessura");
});
