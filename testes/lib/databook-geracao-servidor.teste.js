// A geração do data book continua no SERVIDOR (Vitor, 15/10/2026: "pode fazer os dois"). A OP-094 parou no volume 2
// porque a tela — que tocava volume a volume — trocou de página; o cron só recolhia na hora cheia + 15.
import { describe, it, expect, vi } from "vitest";
import { tocarNoServidor } from "@/lib/databook-geracao-servidor";

describe("tocar a geração no servidor", () => {
  it("monta volumes em sequência até concluir, sem se relançar", async () => {
    const processar = vi.fn().mockResolvedValueOnce({ concluido: false }).mockResolvedValueOnce({ concluido: false }).mockResolvedValueOnce({ concluido: true });
    const relancar = vi.fn();
    const r = await tocarNoServidor({ jobId: "j", processar, relancar, agora: () => 0 });
    expect(processar).toHaveBeenCalledTimes(3);
    expect(relancar).not.toHaveBeenCalled();
    expect(r.concluido).toBe(true);
  });
  it("perto do limite de tempo da função, para e chama a si mesmo para continuar", async () => {
    let t = 0;
    const processar = vi.fn(async () => { t += 70_000; return { concluido: false }; });
    const relancar = vi.fn().mockResolvedValue();
    const r = await tocarNoServidor({ jobId: "j", processar, relancar, agora: () => t });
    expect(processar).toHaveBeenCalledTimes(3); // 0, 70, 140 s começam; 210 s já passa do orçamento de 180 s
    expect(relancar).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ concluido: false, relancado: true });
  });
  it("outra execução com a vez (tela ou cron): sai sem duplicar nem relançar", async () => {
    const processar = vi.fn().mockResolvedValue({ ocupado: true });
    const relancar = vi.fn();
    expect(await tocarNoServidor({ jobId: "j", processar, relancar, agora: () => 0 })).toMatchObject({ ocupado: true });
    expect(relancar).not.toHaveBeenCalled();
  });
});
