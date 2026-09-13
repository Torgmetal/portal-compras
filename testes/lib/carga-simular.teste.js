// Simulador de carga (lib/carga): orientação da peça, formação de volumes e montagem da carga.
// Dados sintéticos — o motor é determinístico, então os números conferidos aqui são regras, não acaso.
import { describe, it, expect } from "vitest";
import { orientarPeca, expandirPecas } from "@/lib/carga/geometria";
import { montarUnidades } from "@/lib/carga/unidades";
import { novoContexto } from "@/lib/carga/empacotar";
import { simularCarga } from "@/lib/carga/simular";
import { PERFIS, perfilDaLqc, GRADE_CARGA } from "@/lib/carga/premissas";
import { hashItens } from "@/lib/carga/hash-itens";

const geo = (dims) => ({ dimsEixos: dims, temGeo: true });
const kgViga = 700;

describe("orientarPeca — perfil com a alma em pé, chapa deitada", () => {
  it("viga modelada deitada: comprimento em X, altura = Y (alma em pé)", () => {
    const o = orientarPeca("VIGA", [12000, 550, 300], null);
    expect([o.C, o.L, o.A]).toEqual([12000, 300, 550]);
    expect(o.almaVertical).toBe(true);
  });
  it("coluna modelada em pé (maior dimensão em Y) deita, com a seção maior para cima", () => {
    const o = orientarPeca("COLUNA", [300, 12000, 550], null);
    expect([o.C, o.L, o.A]).toEqual([12000, 300, 550]);
  });
  it("quadro plano (pórtico) não fica em pé: deita", () => {
    const o = orientarPeca("PORTICO", [6000, 2400, 200], null);
    expect(o.A).toBe(200); expect(o.L).toBe(2400);
  });
  it("chapa: menor dimensão para baixo", () => {
    const o = orientarPeca("CHAPA DE PISO", [2000, 8, 1000], null);
    expect([o.C, o.L, o.A]).toEqual([2000, 1000, 8]);
  });
});

describe("expandirPecas", () => {
  it("expande a quantidade e marca sem caixa a marca sem geometria", () => {
    const p = expandirPecas([{ marca: "t118a1", desc: "VIGA", qtd: 3, kgUn: 100 }, { marca: "T118Z9", desc: "TALA", qtd: 2, kgUn: 5 }], { T118A1: geo([6000, 300, 200]) });
    expect(p).toHaveLength(5);
    expect(p.filter((u) => u.marca === "T118A1" && !u.semCaixa)).toHaveLength(3);
    expect(p.filter((u) => u.semCaixa).map((u) => u.marca)).toEqual(["T118Z9", "T118Z9"]);
  });
});

describe("montarUnidades — a peça vira pacote, caixa ou peça solta", () => {
  const ctx = novoContexto({ prefixo: "T118" });
  it("viga pesada é peça solta; miúdos da mesma marca vão numa caixa de madeira; guarda-corpo em pacote; degraus em pacote de 4 fileiras", () => {
    const lista = [
      { marca: "T118A1", desc: "VIGA", qtd: 2, kgUn: kgViga },
      { marca: "T118C7", desc: "CANTONEIRA", qtd: 10, kgUn: 4 },
      { marca: "T118D1", desc: "G.C", qtd: 3, kgUn: 60 },
      { marca: "T118DG1", desc: "DEGRAU", qtd: 8, kgUn: 7 },
    ];
    const g = { T118A1: geo([12000, 550, 300]), T118C7: geo([800, 50, 50]), T118D1: geo([3000, 1100, 60]), T118DG1: geo([999, 70, 250]) };
    const un = montarUnidades(expandirPecas(lista, g), PERFIS.recomendado, "topo", ctx);
    expect(un.filter((u) => u.tipo === "PECA")).toHaveLength(2);
    const caixa = un.find((u) => u.tipo === "CAIXA"); expect(caixa.membros).toHaveLength(10); expect(caixa.rotulo).toContain("T118C7");
    const gc = un.find((u) => u.gc); expect(gc.membros).toHaveLength(3); expect(gc.rotulo).toContain("fase D");
    const deg = un.find((u) => u.degrau); expect(deg.membros).toHaveLength(8); expect(deg.col).toBe(4); expect(deg.L).toBeGreaterThan(900); // 4 × 250 lado a lado
    for (const u of un) expect(u.transporte).toBe("normal");
  });
  it("peça de 13 m só vai na carreta de 14 m; mais que 14 m é transporte especial", () => {
    const un = montarUnidades(expandirPecas([{ marca: "T118A2", desc: "VIGA", qtd: 1, kgUn: 900 }, { marca: "T118A3", desc: "VIGA", qtd: 1, kgUn: 900 }], { T118A2: geo([13000, 500, 300]), T118A3: geo([15000, 500, 300]) }), PERFIS.recomendado, "topo", ctx);
    expect(un.find((u) => u.marca === "T118A2").transporte).toBe("carreta14");
    expect(un.find((u) => u.marca === "T118A3").transporte).toBe("especial");
  });
});

describe("simularCarga", () => {
  const vigas = (n, marca = "T118A1") => [{ marca, desc: "VIGA", qtd: n, kgUn: kgViga }];
  const gv = { T118A1: geo([12000, 550, 300]) };
  it("12 vigas de 12 m cabem numa carreta só, numeradas do chão para cima", () => {
    const r = simularCarga({ lista: vigas(12), geometria: gv, perfil: "recomendado", prefixo: "T118" });
    expect(r.resumo.viagens).toBe(1);
    const c = r.cargas[0];
    expect(c.veiculo.chave).toBe("carreta"); expect(c.volumes).toBe(12); expect(c.altura).toBeLessThanOrEqual(2900);
    expect(c.romaneio.map((v) => v.volume)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(c.passos).toHaveLength(12); expect(c.madeira.pecas.caibro).toBeGreaterThan(0);
  });
  it("40 vigas passam do peso da carreta: a lista não cabe num veículo e a resposta diz quantas cargas", () => {
    const r = simularCarga({ lista: vigas(40), geometria: gv, perfil: "recomendado", prefixo: "T118" });
    expect(r.resumo.viagens).toBeGreaterThanOrEqual(2);
    expect(r.resumo.peso).toBe(40 * kgViga);
  });
  it("carga só de grades sai em camadas, no teto da carga de grade, com o pacote maior embaixo", () => {
    const lista = [{ marca: "T118G1", desc: "GRADE EL. +2000", qtd: 40, kgUn: 30 }, { marca: "T118G2", desc: "GRADE EL. +2000", qtd: 40, kgUn: 60 }];
    const r = simularCarga({ lista, geometria: { T118G1: geo([1000, 30, 1000]), T118G2: geo([2000, 30, 1000]) }, perfil: "recomendado", prefixo: "T118" });
    expect(r.resumo.viagens).toBe(1);
    const c = r.cargas[0];
    expect(c.grupo).toBe("grades de piso"); expect(c.altura).toBeLessThanOrEqual(GRADE_CARGA.teto);
    const chao = c.itens.filter((u) => u.y === 0), acima = c.itens.filter((u) => u.y > 0);
    expect(chao.length).toBeGreaterThan(0);
    for (const u of acima) expect(u.sobre.length).toBeGreaterThan(0);
  });
  it("carga pequena vai no menor veículo em que cabe (HR), e marca sem geometria fica listada", () => {
    const r = simularCarga({ lista: [{ marca: "T118C1", desc: "CANTONEIRA", qtd: 4, kgUn: 10 }, { marca: "T118X1", desc: "TALA", qtd: 2, kgUn: 3 }], geometria: { T118C1: geo([1500, 60, 60]) }, perfil: "recomendado", prefixo: "T118" });
    expect(r.cargas[0].veiculo.chave).toBe("hr");
    expect(r.semCaixa.map((s) => s.marca)).toEqual(["T118X1", "T118X1"]);
  });
});

describe("perfil da LQC e hash dos itens", () => {
  it("nível de embalagem da LQC → perfil do simulador", () => {
    expect(perfilDaLqc("ECONOMICA").chave).toBe("economico");
    expect(perfilDaLqc("REFORCADA").chave).toBe("exigente");
    expect(perfilDaLqc(undefined).chave).toBe("recomendado");
  });
  it("hash muda com a quantidade e não com a ordem", () => {
    const a = hashItens([{ marca: "A1", qte: 2 }, { marca: "B2", qte: 1 }]);
    expect(hashItens([{ marca: "b2", qte: 1 }, { marca: "a1", qte: 2 }])).toBe(a);
    expect(hashItens([{ marca: "A1", qte: 3 }, { marca: "B2", qte: 1 }])).not.toBe(a);
  });
});

describe("modelo de carga em PDF", () => {
  it("gera A4 paisagem com carga pronta, separação por fase, volumes e uma folha por camada", async () => {
    const { gerarModeloCargaPDF } = await import("@/lib/carga/modelo-carga-pdf");
    const lista = [{ marca: "T118A1", desc: "VIGA", qtd: 6, kgUn: 700 }, { marca: "T118C7", desc: "CANTONEIRA", qtd: 10, kgUn: 4 }, { marca: "T118D1", desc: "G.C", qtd: 3, kgUn: 60 }];
    const r = simularCarga({ lista, geometria: { T118A1: geo([12000, 550, 300]), T118C7: geo([800, 50, 50]), T118D1: geo([3000, 1100, 60]) }, perfil: "recomendado", prefixo: "T118" });
    const { bytes, filename } = await gerarModeloCargaPDF({ op: { numero: "118", cliente: "DANPOWER", obra: "Caldeira" }, previo: { numero: 3 }, carga: r.cargas[0], indice: 0, total: 1, perfilNome: "Padrão", prefixo: "T118", imagens: {} });
    expect(filename).toContain("OP 118");
    expect(Buffer.from(bytes.slice(0, 4)).toString()).toBe("%PDF");
    const camadas = new Set(r.cargas[0].itens.map((u) => u.camada || 0)).size;
    const { PDFDocument } = await import("pdf-lib");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(3 + camadas);
  });
});

describe("catálogo de veículos configurado", () => {
  it("o gravado sobrepõe o padrão; veículo desmarcado sai, mas a carreta e a de 14 m nunca saem", async () => {
    const { catalogoDeVeiculos, linhasDeConfiguracao } = await import("@/lib/carga/config-carga");
    const cfg = { veiculos: [{ chave: "truck", ativo: false }, { chave: "carreta", ativo: false, pesoMax: 27000, frete: 120 }, { chave: "hr", nome: "HR da Torg", C: 3300 }], frete: { toco: 60 } };
    const c = catalogoDeVeiculos(cfg);
    expect(c.veiculos.truck).toBeUndefined();
    expect(c.veiculos.carreta.pesoMax).toBe(27000); expect(c.frete.carreta).toBe(120); expect(c.frete.toco).toBe(60);
    expect(c.veiculos.hr).toMatchObject({ nome: "HR da Torg", C: 3300, L: 1900 });
    expect(c.ordem).toEqual(["hr", "tresquartos", "toco", "carreta"]);
    const linhas = linhasDeConfiguracao(cfg);
    expect(linhas.find((l) => l.chave === "truck").ativo).toBe(false);
    expect(linhas.find((l) => l.chave === "carreta").ativo).toBe(true);
  });
  it("a simulação respeita o catálogo: sem HR e 3/4, a carga pequena vai no toco", async () => {
    const { catalogoDeVeiculos } = await import("@/lib/carga/config-carga");
    const cat = catalogoDeVeiculos({ veiculos: [{ chave: "hr", ativo: false }, { chave: "tresquartos", ativo: false }] });
    const r = simularCarga({ lista: [{ marca: "T118C1", desc: "CANTONEIRA", qtd: 4, kgUn: 10 }], geometria: { T118C1: geo([1500, 60, 60]) }, perfil: "recomendado", prefixo: "T118", opcoes: { veiculos: cat.veiculos, frete: cat.frete } });
    expect(r.cargas[0].veiculo.chave).toBe("toco");
  });
});
