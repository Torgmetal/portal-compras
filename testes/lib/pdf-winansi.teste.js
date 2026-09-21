import { it, expect } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { winAnsi, blindarPdf } from "@/lib/pdf-winansi";

// O nome que derrubou o data book da OP-089 (15/09/2026): "Inspeção" com o til decomposto (a + U+0303)
const NFD = "Relatório de Inspeção";

it("compõe o acento (NFC) em vez de perdê-lo, e troca o que o CP1252 não tem", () => {
  expect(winAnsi(NFD)).toBe("Relatório de Inspeção");
  expect(winAnsi("A ≤ B → C… — ⚠")).toBe("A <= B -> C... - !");
  expect(winAnsi("Ș ā 😀")).toBe("S a ");
});

it("com o documento blindado, drawText e widthOfTextAtSize aceitam o texto decomposto", async () => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  expect(() => font.widthOfTextAtSize(NFD, 10)).toThrow(/WinAnsi cannot encode/);
  blindarPdf(pdf, [font]);
  expect(font.widthOfTextAtSize(NFD, 10)).toBeGreaterThan(0);
  const page = pdf.addPage([200, 100]);
  expect(() => page.drawText(NFD, { x: 10, y: 50, size: 10, font })).not.toThrow();
  expect((await pdf.save()).length).toBeGreaterThan(500);
});
