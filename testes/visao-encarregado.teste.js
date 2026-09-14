import { describe, it, expect } from "vitest";
import { montarVisaoEncarregado } from "@/lib/visao-encarregado";
const hoje = "2026-09-14";
const lote = (id, recurso, dia = hoje, extra = {}) => ({
  id,
  setor: "MONTAGEM",
  recurso,
  dia,
  op: id,
  itens: [{ id, m: id, q: 10, f: 2, prontidao: { pronto: true } }],
  ...extra,
});
const montar = (lotes, recurso = "") =>
  montarVisaoEncarregado(lotes, "MONTAGEM", recurso, hoje, [
    "MONTAGEM 1",
    "MONTAGEM 2",
    "MONTAGEM 3",
  ]);
describe("visão do encarregado", () => {
  it("reúne o trabalho por bancada e destaca prioridades sem antecipar o futuro", () => {
    const v = montar([
      lote("112", "MONTAGEM 2"),
      lote("107", "MONTAGEM 1"),
      lote("121", "MONTAGEM 1", hoje, {
        itens: [
          { id: "prior", q: 6, prioridade: 1, prontidao: { pronto: true } },
        ],
      }),
      lote("120", "MONTAGEM 2", "2026-09-15", {
        itens: [
          { id: "fut", q: 3, prioridade: 1, prontidao: { pronto: true } },
        ],
      }),
    ]);
    expect(v.postos.map((p) => p.recurso)).toEqual([
      "MONTAGEM 1",
      "MONTAGEM 2",
    ]);
    expect(v.postos[0].agora.map((l) => l.op)).toEqual(["121", "107"]);
    expect(v.postos[1].agora.map((l) => l.op)).toEqual(["112"]);
    expect(v.postos[1].proximo.op).toBe("120");
    expect(v.semTrabalho.map((p) => p.recurso)).toEqual(["MONTAGEM 3"]);
  });
  it("separa o saldo sem programação das peças bloqueadas mesmo na mesma OP", () => {
    const v = montar([
      lote("094", null, hoje, {
        fila: true,
        itens: [
          { id: "pronta", q: 12, f: 2, prontidao: { pronto: true } },
          {
            id: "croqui",
            q: 4,
            prontidao: { pronto: false, motivo: "Croquis pendentes" },
          },
          {
            id: "material",
            q: 7,
            impedimento: "Aguardando material",
            prontidao: { pronto: true },
          },
          { id: "fim", q: 5, f: 5, prontidao: { pronto: true } },
        ],
      }),
    ]);
    expect(v.aguardandoProgramacao.map((l) => l.saldo)).toEqual([10]);
    expect(v.pendencias.map((l) => l.saldo)).toEqual([11]);
    expect(v.aguardandoProgramacao[0].itens.map((i) => i.id)).toEqual([
      "pronta",
    ]);
    expect(v.postos).toHaveLength(0);
  });
  it("respeita a bancada selecionada e preserva a programação além dos seis dias", () => {
    const v = montar(
      [
        lote("a", "MONTAGEM 1", "2026-09-15"),
        lote("b", "MONTAGEM 1", "2026-09-20"),
        lote("c", "MONTAGEM 1", "2026-09-21"),
        lote("d", "MONTAGEM 2"),
      ],
      "MONTAGEM 1",
    );
    expect(v.proximos.map((l) => l.op)).toEqual(["a", "b"]);
    expect(v.maisAdiante.map((l) => l.op)).toEqual(["c"]);
    expect(v.postos).toHaveLength(0);
    expect(v.semTrabalho.map((p) => p.recurso)).toEqual(["MONTAGEM 1"]);
    expect(v.semTrabalho[0].proximo.op).toBe("a");
  });
});
