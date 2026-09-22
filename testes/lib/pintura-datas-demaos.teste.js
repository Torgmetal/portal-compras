import { it, expect } from "vitest";
import { extractText } from "unpdf";
import { gerarPinturaPDF } from "@/lib/relatorio-pintura-pdf";

it("imprime datas e horários separados para cada demão no PDF", async () => {
  const demaos = {
    "1": { data: "2026-09-20", hIni: "07:15", hFim: "11:45" },
    "2": { data: "2026-09-21", hIni: "08:15", hFim: "12:45" },
    "3": { data: "2026-09-22", hIni: "09:15", hFim: "13:45" },
  };
  const pdf = await gerarPinturaPDF({ rel: { codigo: "RIP-113-001", opNumero: "113", revisao: 0, resultados: { prepData: "2026-09-19", demaos } } });
  const { text } = await extractText(new Uint8Array(pdf), { mergePages: true });
  for (const bloco of Object.values(demaos)) for (const valor of Object.values(bloco)) expect(text).toContain(valor);
  expect(text).toContain("2026-09-19");
});
