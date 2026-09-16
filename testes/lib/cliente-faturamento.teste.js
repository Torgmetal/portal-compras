// A aba "Pedidos e faturamento": OC do cliente × pedido de venda do Omie × parcelas do cache.
import { describe, it, expect } from "vitest";
import { chaveOC, cruzarPedidos, situacaoDoPedido, contatoVeFaturamento } from "@/lib/cliente-faturamento";

const HOJE = new Date("2026-09-16T12:00:00Z");
const medicao = (numero, oc, previsao, valor, extra = {}) => ({ numeroPedidoOmie: numero, valorBruto: valor, data: null, aditivoId: null, payload: { pedido_venda_produto: { cabecalho: { data_previsao: previsao }, informacoes_adicionais: { numero_pedido_cliente: oc, ...extra } } } });

describe("chaveOC", () => {
  it("iguala as grafias da TMSA: 'OC 232301-1', 'OC232301-1' e '232301-1'", () => {
    expect(chaveOC("OC 232301-1")).toBe("2323011");
    expect(chaveOC("oc232301-1")).toBe("2323011");
    expect(chaveOC("232301-1")).toBe("2323011");
    expect(chaveOC(null)).toBe("");
  });
});

describe("situacaoDoPedido", () => {
  it("lê as parcelas do cache", () => {
    expect(situacaoDoPedido(null).codigo).toBe("SEM_OMIE");
    expect(situacaoDoPedido({ faturado: 100, aFaturar: 0, parcelas: [{ situacao: "Faturado" }] }).codigo).toBe("FATURADO");
    expect(situacaoDoPedido({ faturado: 0, aFaturar: 100, parcelas: [{ situacao: "Não Faturado", dataPrevisao: "2026-08-14T00:00:00.000Z" }] }, HOJE).codigo).toBe("VENCIDO");
    expect(situacaoDoPedido({ faturado: 0, aFaturar: 100, parcelas: [{ situacao: "Não Faturado", dataPrevisao: "2026-10-01T00:00:00.000Z" }] }, HOJE).codigo).toBe("AGUARDANDO");
    expect(situacaoDoPedido({ faturado: 50, aFaturar: 50, parcelas: [{ situacao: "Faturado" }, { situacao: "Não Faturado", dataPrevisao: "2026-12-01" }] }, HOJE).codigo).toBe("PARCIAL");
    expect(situacaoDoPedido({ faturado: 0, aFaturar: 0, parcelas: [{ situacao: "Cancelado" }] }).codigo).toBe("CANCELADO");
  });
});

describe("cruzarPedidos — OP-120 como está hoje", () => {
  const referencias = [
    { id: "p", papel: "PROJETO", rotulo: "TPR", codigo: "TPR00699", ordem: 0 },
    { id: "a", papel: "PEDIDO", rotulo: "OC", codigo: "230689-1", descricao: "Longarina", valor: 122226.6, ordem: 1, aditivoId: null },
    { id: "t", papel: "TAG", rotulo: "TAG", codigo: "TC 8010", paiId: "a", ordem: 2 },
  ];
  const medicoes = [
    medicao("321", "OC230689-1", "23/11/2026", 122226.6, { dados_adicionais_nf: "ETC TPR699-086" }),
    medicao("327", "OC 232301-1", "16/11/2026", 429877.11), // aditivo lançado no Omie, ainda sem cadastro na OP
  ];
  const cacheObra = { numeroOp: "120", pedidos: [
    { numero: "321", faturado: 0, aFaturar: 122226.6, parcelas: [{ valor: 122226.6, situacao: "Não Faturado", dataPrevisao: "2026-11-23T00:00:00.000Z", atrasado: false }] },
    { numero: "327", faturado: 0, aFaturar: 429877.11, parcelas: [{ valor: 429877.11, situacao: "Não Faturado", dataPrevisao: "2026-11-16T00:00:00.000Z", atrasado: false }] },
  ] };
  const r = cruzarPedidos({ referencias, medicoes, aditivos: [], cacheObra, hoje: HOJE });

  it("casa a OC cadastrada com o pedido do Omie pela OC gravada no pedido de venda", () => {
    const l = r.linhas.find((x) => x.oc === "230689-1");
    expect(l.origem).toBe("OP");
    expect(l.tags).toEqual(["TC 8010"]);
    expect(l.pedidosOmie.map((p) => p.numero)).toEqual(["321"]);
    expect(l.pedidosOmie[0].previsao).toBe("2026-11-23");
    expect(l.situacao.codigo).toBe("AGUARDANDO");
    expect(l.avisos).toEqual([]);
  });
  it("OC que só existe no Omie vira linha com aviso — não some", () => {
    const l = r.linhas.find((x) => x.chave === chaveOC("OC 232301-1"));
    expect(l.origem).toBe("OMIE");
    expect(l.avisos[0]).toMatch(/ainda não está ligado ao cadastro/);
    expect(l.contratado).toBe(429877.11);
  });
  it("totais somam contratado, faturado e a faturar", () => {
    expect(r.totais.pedidos).toBe(2);
    expect(r.totais.contratado).toBeCloseTo(552103.71, 2);
    expect(r.totais.faturado).toBe(0);
    expect(r.totais.aFaturar).toBeCloseTo(552103.71, 2);
  });
});

describe("cruzarPedidos — pedido sem OC e previsão vencida (OP-089 / OP-107)", () => {
  it("avisa o pedido sem OC e marca a previsão vencida", () => {
    const r = cruzarPedidos({ referencias: [], medicoes: [medicao("235", null, "31/08/2026", 387644.72), medicao("302", "OC229342-1", "14/08/2026", 71814.53)], aditivos: [],
      cacheObra: { pedidos: [
        { numero: "235", faturado: 222172.04, aFaturar: 260692.27, parcelas: [{ valor: 260692.27, situacao: "Não Faturado", dataPrevisao: "2026-09-04T00:00:00.000Z", atrasado: true }, { valor: 88189.59, situacao: "Faturado", dataPrevisao: "2026-09-04" }] },
        { numero: "302", faturado: 0, aFaturar: 71814.53, parcelas: [{ valor: 71814.53, situacao: "Não Faturado", dataPrevisao: "2026-08-14T00:00:00.000Z", atrasado: true }] },
      ] }, hoje: HOJE });
    const semOC = r.linhas.find((l) => !l.oc);
    expect(semOC.avisos[0]).toMatch(/ainda não registrou o número da sua OC/);
    expect(semOC.situacao.codigo).toBe("VENCIDO");
    expect(semOC.situacao.rotulo).toBe("Parcial · saldo vencido");
    expect(r.linhas.find((l) => l.oc === "OC229342-1").situacao.rotulo).toBe("Previsão vencida");
    expect(r.totais.vencido).toBeCloseTo(260692.27 + 71814.53, 2);
  });
});

describe("contatoVeFaturamento", () => {
  it("só com o papel FATURAMENTO", () => {
    expect(contatoVeFaturamento({ email: "a@b", papeis: ["FATURAMENTO"] })).toBe(true);
    expect(contatoVeFaturamento({ email: "a@b" })).toBe(false);
    expect(contatoVeFaturamento(null)).toBe(false);
  });
});

import { descricaoDoPedidoOmie } from "@/lib/cliente-faturamento";
describe("o que o cliente lê na linha", () => {
  it("descrição de reserva vem do item do pedido de venda, em caixa normal", () => {
    expect(descricaoDoPedidoOmie({ det: [{ produto: { descricao: "ARMACAO DE ESTRUTURAS METALICA MT" } }] })).toBe("Armacao de Estruturas Metalica MT");
    expect(descricaoDoPedidoOmie({ det: [] })).toBeNull();
  });
  it("notas emitidas e 'vencida desde' saem prontos da linha", () => {
    const r = cruzarPedidos({ referencias: [], medicoes: [medicao("235", null, "31/08/2026", 387644.72)], aditivos: [],
      cacheObra: { pedidos: [{ numero: "235", faturado: 222172.04, aFaturar: 260692.27, parcelas: [
        { valor: 260692.27, situacao: "Não Faturado", dataPrevisao: "2026-09-04T00:00:00.000Z", atrasado: true },
        { valor: 83329.42, situacao: "Cancelado", dataPrevisao: "2026-09-03" },
        { valor: 88189.59, situacao: "Faturado", dataPrevisao: "2026-09-04" }, { valor: 34752.85, situacao: "Faturado", dataPrevisao: "2026-09-10" }] }] }, hoje: HOJE });
    const l = r.linhas[0];
    expect(l.notas.map((n) => `${n.data}:${n.valor}`)).toEqual(["2026-09-04:88189.59", "2026-09-10:34752.85"]);
    expect(l.canceladas).toBe(1);
    expect(l.vencidaDesde).toBe("2026-09-04");
    expect(l.avisos[0]).toMatch(/A Torg ainda não registrou/);
  });
});

describe("número da NF na linha de notas", () => {
  it("usa o número e a data de emissão quando a nota já foi consultada", () => {
    const nfPorCodigo = new Map([["777", { numero: "1234", serie: "1", chave: "3526…", dataEmissao: "2026-09-05" }]]);
    const r = cruzarPedidos({ referencias: [], medicoes: [medicao("235", "OC1", "31/08/2026", 100)], aditivos: [],
      cacheObra: { pedidos: [{ numero: "235", faturado: 100, aFaturar: 0, parcelas: [{ valor: 100, situacao: "Faturado", dataPrevisao: "2026-09-04", codigoPedido: 777 }] }] }, hoje: HOJE, nfPorCodigo });
    expect(r.linhas[0].notas[0]).toMatchObject({ numero: "1234", data: "2026-09-05", valor: 100 });
  });
});

import { rotuloComCodigo } from "@/lib/cliente-faturamento";
describe("rotuloComCodigo", () => {
  it("não repete o rótulo que já vem no código", () => {
    expect(rotuloComCodigo("OC", "OC228351-1")).toBe("OC 228351-1");
    expect(rotuloComCodigo("OC", "OC 229124-1")).toBe("OC 229124-1");
    expect(rotuloComCodigo("OC", "232301-1")).toBe("OC 232301-1");
    expect(rotuloComCodigo("AF", "AF 10862")).toBe("AF 10862");
  });
});
