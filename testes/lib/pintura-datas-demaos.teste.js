import { it, expect } from "vitest";
import { extractText } from "unpdf";
import { gerarPinturaPDF } from "@/lib/relatorio-pintura-pdf";

// ⚠ As datas saem dd/mm/aaaa desde a verificação dos modelos (02/10/2026) — o PDF imprimia o ISO do
// <input type="date"> ("2026-09-20"). A conversão troca as partes de lugar, sem fuso: o dia é o digitado.
const br = (iso) => iso.split("-").reverse().join("/");

it("imprime datas e horários separados para cada demão no PDF", async () => {
  const demaos = {
    "1": { data: "2026-09-20", hIni: "07:15", hFim: "11:45" },
    "2": { data: "2026-09-21", hIni: "08:15", hFim: "12:45" },
    "3": { data: "2026-09-22", hIni: "09:15", hFim: "13:45" },
  };
  const pdf = await gerarPinturaPDF({ rel: { codigo: "RIP-113-001", opNumero: "113", revisao: 0, resultados: { prepData: "2026-09-19", demaos } } });
  const { text } = await extractText(new Uint8Array(pdf), { mergePages: true });
  for (const bloco of Object.values(demaos)) {
    expect(text).toContain(br(bloco.data));
    expect(text).toContain(bloco.hIni);
    expect(text).toContain(bloco.hFim);
  }
  expect(text).toContain("19/09/2026");
  expect(text).not.toContain("2026-09-19");
});
