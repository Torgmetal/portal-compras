// Achados da verificação dos modelos (02/10/2026), que valem para TODOS os relatórios — a moldura de
// texto é compartilhada (lib/relatorio-form-pdf):
//  1. um TAB (célula colada do Excel) derrubava a geração inteira com "WinAnsi cannot encode" — e com ela
//     a prévia, o envio para assinatura, o arquivamento e o data book;
//  2. palavra mais larga que a coluna ("T112A1/T112A2/…", sem espaço) era escrita inteira, por cima da
//     coluna vizinha;
//  3. "≤ 0,5 mm" virava " 0,5 mm" — o símbolo sumia e o sentido mudava.
import { describe, it, expect } from "vitest";
import { abrirDocumento, novaFolha, san, quebrarTexto } from "@/lib/relatorio-form-pdf";

describe("texto nos PDFs dos relatórios", () => {
  it("caractere de controle e quebra de linha viram espaço — san é texto de UMA linha", () => {
    expect(san("PC\t4500123")).toBe("PC 4500123");
    expect(san("a\r\nb")).toBe("a b");
    expect(san("x\u0007y\u009Fz")).toBe("x y z");
  });

  it("símbolo que muda o sentido vira equivalente; o que a fonte escreve (€ •) fica", () => {
    expect(san("≥ 60 μm; ≤ 2; 5 € • ok")).toBe(">= 60 µm; <= 2; 5 € • ok");
    expect(san("“a” – b…")).toBe('"a" - b...');
  });

  it("valor de uma linha com TAB, quebra e símbolo não derruba o PDF", async () => {
    const doc = await abrirDocumento();
    const f = novaFolha(doc);
    expect(() => f.linhaInfo([["ORDEM DE COMPRA:", "PC\t4500123\nlinha 2 ≥ 3 \u0096", 1]])).not.toThrow();
    expect(() => f.blocoTexto("OBS:", "um\tdois\nтри ≤ 4")).not.toThrow();
    await expect(doc.pdf.save()).resolves.toBeTruthy();
  });

  it("palavra mais larga que a coluna é partida no separador — nada se perde, nada se inventa", async () => {
    const doc = await abrirDocumento();
    const longa = Array.from({ length: 20 }, (_, i) => `T112A${i + 1}`).join("/");
    const linhas = quebrarTexto(longa, doc.bold, 8, 120);
    expect(linhas.length).toBeGreaterThan(1);
    for (const l of linhas) expect(doc.bold.widthOfTextAtSize(l, 8)).toBeLessThanOrEqual(120);
    expect(linhas.join("")).toBe(longa);
    for (const l of linhas.slice(0, -1)) expect(l.endsWith("/")).toBe(true); // nunca "T1" | "12A1"
  });

  it("com texto antes, a palavra longa começa na mesma linha só se o corte cair num separador", async () => {
    const doc = await abrirDocumento();
    const linhas = quebrarTexto("Peças: T112A1/T112A2/T112A3/T112A4/T112A5/T112A6", doc.bold, 8, 120);
    for (const l of linhas) expect(doc.bold.widthOfTextAtSize(l, 8)).toBeLessThanOrEqual(120);
    // cada pedaço entre barras e espaços continua uma marca inteira: nenhuma foi partida entre linhas
    const pedacos = linhas.flatMap((l) => l.split(/[\s/]+/).filter(Boolean));
    expect(pedacos).toEqual(["Peças:", "T112A1", "T112A2", "T112A3", "T112A4", "T112A5", "T112A6"]);
  });

  it("texto normal quebra como antes, por palavra e por parágrafo", async () => {
    const doc = await abrirDocumento();
    const f = novaFolha(doc);
    expect(f.quebrar("um dois três", f.font, 8, 1000)).toEqual(["um dois três"]);
    expect(f.quebrar("primeiro parágrafo\nsegundo", f.font, 8, 1000)).toEqual(["primeiro parágrafo", "segundo"]);
    expect(f.quebrar("a\tb", f.font, 8, 1000)).toEqual(["a b"]);
    expect(f.quebrar("", f.font, 8, 1000)).toEqual([]);
  });
});
