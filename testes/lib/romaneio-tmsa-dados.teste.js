// De onde o FOR-081 tira os dados (lib/romaneio-tmsa-dados.js): TAG por peça (lista de equivalência da TMSA), OC de cada
// TAG (Referências da OP: OC → TAG), TPR (Referências) e os volumes da última simulação do romaneio prévio.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/etc-tmsa-dados", () => ({ etcsDaObra: vi.fn() }));
import { dadosTmsa } from "@/lib/romaneio-tmsa-dados";
const semEtcs = async () => ({ etcs: [], tpr: null, avisos: [] });

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.etiquetaCampoExtra.findMany.mockResolvedValue([
    { marca: "105A3", unidade: 2, tagCliente: "TC 4707" }, { marca: "105a3", unidade: 1, tagCliente: "TC 4706" },
  ]);
  mockPrisma.oPReferencia.findMany.mockResolvedValue([
    { id: "p", paiId: null, papel: "projeto", codigo: "TPR00846" },
    { id: "oc1", paiId: "p", papel: "pedido", codigo: "231297-1" },
    { id: "t1", paiId: "oc1", papel: "tag", codigo: "TC 4706" },
    { id: "oc2", paiId: "p", papel: "pedido", codigo: "231300-2" },
    { id: "i", paiId: "oc2", papel: "item", codigo: "ETC-1" },
    { id: "t2", paiId: "i", papel: "tag", codigo: "TC-4707" },
  ]);
  mockPrisma.cargaSimulada.findFirst.mockResolvedValue({ cargas: [
    { romaneio: [{ volume: 1, dimsCm: [600, 100, 40], madeira: { caibro: 4 }, itens: [{ marca: "105A3", qtd: 1 }] }] },
    { romaneio: [{ volume: 1, dimsCm: [300, 90, 40], madeira: { caibro: 2 }, itens: [{ marca: "105A3", qtd: 1 }] }] },
  ] });
});

describe("dados do FOR-081", () => {
  it("TAG por unidade (marca sem caixa), OC subindo a árvore das Referências, TPR", async () => {
    const d = await dadosTmsa({ op: { id: "op105", numero: "105" }, previoId: "pv", seguirSimulacao: true, lerEtcs: semEtcs });
    expect(d.tags.get("105A3")).toEqual([{ unidade: 1, tag: "TC 4706" }, { unidade: 2, tag: "TC 4707" }]);
    expect(d.ocPorTag.get("TC4706")).toBe("231297-1");
    expect(d.ocPorTag.get("TC4707")).toBe("231300-2");
    expect(d.tpr).toBe("TPR00846");
  });
  it("volumes de todas as cargas da simulação, numerados em sequência", async () => {
    const d = await dadosTmsa({ op: { id: "op105", numero: "105" }, previoId: "pv", seguirSimulacao: true, lerEtcs: semEtcs });
    expect(d.volumes.map((v) => [v.volume, v.dimsCm[0]])).toEqual([[1, 600], [2, 300]]);
  });
  it("sem seguir a simulação, nem a consulta", async () => {
    const d = await dadosTmsa({ op: { id: "op105", numero: "105" }, previoId: "pv", seguirSimulacao: false, lerEtcs: semEtcs });
    expect(d.volumes).toBe(null);
    expect(mockPrisma.cargaSimulada.findFirst).not.toHaveBeenCalled();
  });
  it("TPR também vem do refCliente quando as Referências não têm projeto", async () => {
    mockPrisma.oPReferencia.findMany.mockResolvedValue([]);
    const d = await dadosTmsa({ op: { id: "op105", numero: "105", refCliente: "TPR-00699 · OC 1" }, previoId: "pv", seguirSimulacao: false, lerEtcs: semEtcs });
    expect(d.tpr).toBe("TPR-00699");
  });

  it("sem cadastro nas Referências, a OC vem das ETCs (TAG + desenho) e o TPR também", async () => {
    mockPrisma.oPReferencia.findMany.mockResolvedValue([]);
    const lerEtcs = async () => ({ tpr: "TPR00846", avisos: [], etcs: [
      { oc: "228631", itens: [{ desenho: "72118932", tag: "TC 4708" }] },
      { oc: "228630", itens: [{ desenho: "70408127", tag: "TC 4708" }] },
    ] });
    const d = await dadosTmsa({ op: { id: "op105", numero: "105" }, previoId: "pv", seguirSimulacao: false, lerEtcs });
    expect(d.ocDe("TC 4708", "72118932-1")).toBe("228631");
    expect(d.ocDe("TC 4708", "704081271")).toBe("228630");
    expect(d.tpr).toBe("TPR00846");
  });
  it("o cadastro nas Referências da OP vale sobre a ETC", async () => {
    const lerEtcs = async () => ({ tpr: "TPR99999", avisos: [], etcs: [{ oc: "000001", itens: [{ desenho: "1", tag: "TC 4706" }] }] });
    const d = await dadosTmsa({ op: { id: "op105", numero: "105" }, previoId: "pv", seguirSimulacao: false, lerEtcs });
    expect(d.ocDe("TC 4706", "105A1")).toBe("231297-1");
    expect(d.tpr).toBe("TPR00846");
  });
});
