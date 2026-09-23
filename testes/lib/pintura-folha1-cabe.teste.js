import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { PDFPage } from "pdf-lib";
import { extractText } from "unpdf";
import { gerarPinturaPDF } from "@/lib/relatorio-pintura-pdf";
import { M } from "@/lib/relatorio-form-pdf";

// A FOLHA 1 DA PINTURA TEM DE CABER NA FOLHA — e a cor da tinta tem de estar nela.
//
// Varredura de 23/09/2026: no RIP-106-002 (4 instrumentos + 3 assinaturas com imagem) as datas das
// assinaturas foram desenhadas em y = −2,2 pt, fora do papel; em outros quatro, a 8 pt da borda, na
// faixa que a impressora não imprime. E a COR aplicada em cada demão, gravada no relatório, não saía
// no PDF — a TMSA devolveu o RIP-103-002 R00 justamente por "não contemplar todas as cores".

let ys;
beforeEach(() => {
  ys = [];
  const orig = { t: PDFPage.prototype.drawText, i: PDFPage.prototype.drawImage };
  vi.spyOn(PDFPage.prototype, "drawText").mockImplementation(function (txt, o) { ys.push({ y: o?.y, txt }); return orig.t.call(this, txt, o); });
  vi.spyOn(PDFPage.prototype, "drawImage").mockImplementation(function (img, o) { ys.push({ y: o?.y, txt: "[img]" }); return orig.i.call(this, img, o); });
  // a imagem da assinatura não baixa no teste — o bloco reserva a altura mesmo assim
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("sem rede")));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const INSTRUMENTOS = ["TH-01", "TM-01", "RGT-01", "MPS-01"].map((c) => ({ codigo: c, nome: `Instrumento ${c}`, certificado: "CERT-0001", validade: "2027-05-01" }));
const assina = (nome, setor) => ({ nome, setor, assinadoEm: new Date("2026-09-11T16:00:00Z"), imagemUrl: "https://exemplo/assinatura.png", email: `${nome}@x.com` });
const rel = {
  codigo: "RIP-106-002", opNumero: "106", revisao: 1, inspetor: "Alexandre Stival", equipamentos: INSTRUMENTOS,
  observacoes: "Sem observações.",
  resultados: {
    demaos: {
      1: { produto: "PRIMER DUPLA FUNÇÃO", cor: "RAL 1015", data: "2026-09-03" },
      2: { produto: "POLIURETANO", cor: "AMARELO SEGURANÇA", data: "2026-09-04" },
    },
  },
};

it("nada da folha 1 é desenhado abaixo da margem, nem com 4 instrumentos e 3 assinaturas com imagem", async () => {
  await gerarPinturaPDF({ rel, assinaturas: [assina("Geraldo Tank", "Torg Metal"), assina("Alexandre Stival", "Inspetor"), assina("Davi Pinho", "Cliente")] });
  const baixos = ys.filter((p) => typeof p.y === "number" && p.y < M - 1);
  expect(baixos).toEqual([]);
});

it("a cor aplicada em cada demão sai no documento", async () => {
  const pdf = await gerarPinturaPDF({ rel });
  const { text } = await extractText(new Uint8Array(pdf), { mergePages: true });
  expect(text).toContain("RAL 1015");
  expect(text).toContain("AMARELO SEGURANÇA");
});
