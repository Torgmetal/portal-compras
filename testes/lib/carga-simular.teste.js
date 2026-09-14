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
  it("expande a quantidade; marca sem geometria mas com peso entra com caixa estimada; sem peso fica sem caixa", () => {
    const p = expandirPecas([{ marca: "t118a1", desc: "VIGA", qtd: 3, kgUn: 100 }, { marca: "T118Z9", desc: "TALA", qtd: 2, kgUn: 5 }, { marca: "T118-AC1", desc: "PARAFUSO", qtd: 4, kgUn: 0 }], { T118A1: geo([6000, 300, 200]) });
    expect(p).toHaveLength(9);
    expect(p.filter((u) => u.marca === "T118A1" && !u.semCaixa && !u.estimada)).toHaveLength(3);
    expect(p.filter((u) => u.marca === "T118Z9").every((u) => u.estimada && u.C > 0)).toBe(true);
    expect(p.filter((u) => u.semCaixa).map((u) => u.marca)).toEqual(["T118-AC1", "T118-AC1", "T118-AC1", "T118-AC1"]);
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
  it("carga pequena vai no menor veículo em que cabe (HR); marca sem geometria entra estimada e parafuso sem peso fica listado", () => {
    const r = simularCarga({ lista: [{ marca: "T118C1", desc: "CANTONEIRA", qtd: 4, kgUn: 10 }, { marca: "T118X1", desc: "TALA", qtd: 2, kgUn: 3 }, { marca: "T118-AC2", desc: "PORCA", qtd: 2, kgUn: 0 }], geometria: { T118C1: geo([1500, 60, 60]) }, perfil: "recomendado", prefixo: "T118" });
    expect(r.cargas[0].veiculo.chave).toBe("hr");
    expect(r.estimadas.map((e) => e.marca)).toEqual(["T118X1"]);
    expect(r.semCaixa.map((s) => s.marca)).toEqual(["T118-AC2", "T118-AC2"]);
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
  it("gera A4 paisagem: carga pronta, modelos de embalagem, cartões de volume (6 por folha), camadas (4 por folha) e o anexo por fase", async () => {
    const { gerarModeloCargaPDF } = await import("@/lib/carga/modelo-carga-pdf");
    const lista = [{ marca: "T118A1", desc: "VIGA", qtd: 6, kgUn: 700 }, { marca: "T118C7", desc: "CANTONEIRA", qtd: 10, kgUn: 4 }, { marca: "T118D1", desc: "G.C", qtd: 3, kgUn: 60 }];
    const r = simularCarga({ lista, geometria: { T118A1: geo([12000, 550, 300]), T118C7: geo([800, 50, 50]), T118D1: geo([3000, 1100, 60]) }, perfil: "recomendado", prefixo: "T118" });
    const { bytes, filename } = await gerarModeloCargaPDF({ op: { numero: "118", cliente: "DANPOWER", obra: "Caldeira" }, previo: { numero: 3 }, carga: r.cargas[0], indice: 0, total: 1, perfilNome: "Padrão", prefixo: "T118", imagens: {} });
    expect(filename).toContain("OP 118");
    expect(Buffer.from(bytes.slice(0, 4)).toString()).toBe("%PDF");
    const camadas = new Set(r.cargas[0].itens.map((u) => u.camada || 0)).size, volumes = r.cargas[0].itens.length;
    const { PDFDocument } = await import("pdf-lib");
    // 1 (carga) + 1 (modelos) + cartões (6 por folha) + camadas (4 por folha) + anexo (1)
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2 + Math.ceil(volumes / 6) + Math.ceil(camadas / 4) + 1);
  });

  // ⚠ o PDF é montado NO NAVEGADOR (14/09/2026): a lib não pode depender de fs/Buffer, o logo entra por
  // parâmetro e a foto entra como data URL (o pdf-lib decodifica o base64 sozinho).
  it("roda sem Node: sem fs, sem Buffer, logo por parâmetro e foto em data URL", async () => {
    const fonte = (await import("fs")).readFileSync(new URL("../../lib/carga/modelo-carga-pdf.js", import.meta.url), "utf8");
    expect(fonte).not.toMatch(/^import .*from "(fs|path|server-only)"|^import "server-only"|Buffer\./m);
    const { gerarModeloCargaPDF } = await import("@/lib/carga/modelo-carga-pdf");
    const lista = [{ marca: "T118A1", desc: "VIGA", qtd: 2, kgUn: 700 }];
    const r = simularCarga({ lista, geometria: { T118A1: geo([12000, 550, 300]) }, perfil: "recomendado", prefixo: "T118" });
    // JPEG mínimo válido (1×1) em data URL, como o canvas do 3D devolve
    const jpeg = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";
    const logo = (await import("fs")).readFileSync(new URL("../../public/torg-logo-white.png", import.meta.url));
    const { bytes } = await gerarModeloCargaPDF({ op: { numero: "118" }, previo: { numero: 1 }, carga: r.cargas[0], perfilNome: "Padrão", prefixo: "T118", imagens: { full: { iso: jpeg }, camadas: [] }, logo: new Uint8Array(logo) });
    const { PDFDocument, PDFName, PDFRawStream } = await import("pdf-lib");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(3);
    // o logo (PNG) e a foto (JPEG) entraram como imagens do documento
    const imagens = doc.context.enumerateIndirectObjects().filter(([, o]) => o instanceof PDFRawStream && o.dict.get(PDFName.of("Subtype")) === PDFName.of("Image"));
    expect(imagens.length).toBeGreaterThanOrEqual(2);
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

describe("quadro vazado (pórtico, treliça) deitado", () => {
  it("nada sobe num pórtico a não ser outro pórtico igual — o feixe de colunas vai para o chão, não para o vão do quadro", () => {
    const lista = [{ marca: "T107C2", desc: "PORTICO", qtd: 2, kgUn: 140 }, { marca: "T107A13", desc: "COLUNA", qtd: 2, kgUn: 45 }];
    const r = simularCarga({ lista, geometria: { T107C2: geo([2900, 250, 1130]), T107A13: geo([200, 2650, 270]) }, perfil: "recomendado", prefixo: "T107" });
    const c = r.cargas[0], porticos = c.itens.filter((u) => u.membros[0].desc === "PORTICO"), colunas = c.itens.find((u) => u.membros[0].desc === "COLUNA");
    for (const u of colunas ? [colunas] : []) for (const id of u.sobre || []) expect(porticos.map((p) => p.id)).not.toContain(id);
    const emCima = porticos.find((p) => p.y > 0); if (emCima) expect(emCima.sobre.every((id) => porticos.some((p) => p.id === id))).toBe(true);
  });
});

describe("peça fora do IFC entra com caixa estimada pelo peso", () => {
  it("escada móvel, contrapeso e batente não somem da carga; parafuso sem peso fica fora", async () => {
    const { caixaEstimada } = await import("@/lib/carga/geometria");
    expect(caixaEstimada("ESCADA MOVEL", 50)[0]).toBeGreaterThanOrEqual(1500);
    expect(caixaEstimada("CONTRA PESO", 22)[0]).toBeLessThan(200);
    expect(caixaEstimada("BARRA ROSCADA M12", 0)).toBeNull();
    const lista = [{ marca: "72162417", desc: "ESCADA MOVEL MENOR 205", qtd: 1, kgUn: 50 }, { marca: "72162401", desc: "CONTRA PESO", qtd: 2, kgUn: 11 }, { marca: "72162413", desc: "BATENTE INFERIOR", qtd: 4, kgUn: 1 }, { marca: "T107-AC1", desc: "BARRA ROSCADA M12", qtd: 16, kgUn: 0 }];
    const r = simularCarga({ lista, geometria: {}, perfil: "recomendado", prefixo: "T107" });
    expect(r.estimadas.map((e) => e.marca).sort()).toEqual(["72162401", "72162413", "72162417"]);
    expect(r.semCaixa.every((s) => s.marca === "T107-AC1")).toBe(true);
    const pecasNaCarga = r.cargas.flatMap((c) => c.itens).reduce((t, u) => t + u.membros.length, 0);
    expect(pecasNaCarga).toBe(7);
    // fora do IFC só viaja EMBALADA: tudo em caixa de madeira, nada solto nem em feixe
    for (const u of r.cargas.flatMap((c) => c.itens)) expect(u.tipo).toBe("CAIXA");
    expect(r.resumo.foraDoModelo).toBe(3);
  });
});

describe("ajustes por marca", () => {
  const g = { T118A1: geo([12000, 550, 300]), T118C7: geo([800, 50, 50]), T118C8: geo([900, 60, 60]), T118D1: geo([3000, 1100, 60]) };
  it("normaliza regras: opção desconhecida cai fora, medidas incompletas são recusadas, vazio vira null", async () => {
    const { normalizarRegras, resumoDaRegra } = await import("@/lib/carga/ajustes");
    expect(normalizarRegras({ embalagem: "xyz", posicao: "chao" })).toEqual(expect.objectContaining({ embalagem: "", posicao: "chao" }));
    expect(normalizarRegras({})).toBeNull();
    expect(() => normalizarRegras({ medidas: { C: 1000 } })).toThrow(/medidas/i);
    expect(resumoDaRegra(normalizarRegras({ embalagem: "caixa", juntoCom: "kit 1" }))).toContain("Caixa de madeira");
  });
  it("não empacotar: a cantoneira miúda vai solta em vez de para a caixa", () => {
    const lista = [{ marca: "T118C7", desc: "CANTONEIRA", qtd: 4, kgUn: 4 }];
    const r = simularCarga({ lista, geometria: g, perfil: "recomendado", prefixo: "T118", ajustes: { T118C7: { embalagem: "solta" } } });
    expect(r.cargas[0].itens.every((u) => u.tipo === "PECA")).toBe(true); expect(r.cargas[0].volumes).toBe(4);
  });
  it("junto com: duas marcas de famílias diferentes viajam num pacote só", () => {
    const lista = [{ marca: "T118C7", desc: "CANTONEIRA", qtd: 4, kgUn: 4 }, { marca: "T118C8", desc: "TALA", qtd: 2, kgUn: 5 }];
    const r = simularCarga({ lista, geometria: g, perfil: "recomendado", prefixo: "T118", ajustes: { T118C7: { juntoCom: "kit 1" }, T118C8: { juntoCom: "kit 1" } } });
    expect(r.cargas[0].volumes).toBe(1); const u = r.cargas[0].itens[0]; expect(u.membros).toHaveLength(6); expect(u.rotulo).toContain("kit 1");
  });
  it("no chão: a viga marcada fica no assoalho mesmo com lugar em cima; nada em cima: nada sobe nela", () => {
    const lista = [{ marca: "T118A1", desc: "VIGA", qtd: 3, kgUn: 700 }, { marca: "T118D1", desc: "G.C", qtd: 3, kgUn: 60 }];
    const r1 = simularCarga({ lista, geometria: g, perfil: "recomendado", prefixo: "T118", ajustes: { T118A1: { posicao: "chao" } } });
    for (const v of r1.cargas[0].itens.filter((u) => u.membros[0].marca === "T118A1")) expect(v.y).toBe(0);
    const r2 = simularCarga({ lista, geometria: g, perfil: "recomendado", prefixo: "T118", ajustes: { T118A1: { posicao: "nadaEmCima" } } });
    const vigas = r2.cargas.flatMap((c) => c.itens).filter((u) => u.membros[0].marca === "T118A1").map((v) => v.id);
    for (const u of r2.cargas.flatMap((c) => c.itens).filter((u) => u.y > 0)) for (const id of u.sobre) expect(vigas).not.toContain(id);
  });
  it("medidas à mão: marca sem IFC entra com a medida informada, em caixa, sem estimativa", () => {
    const lista = [{ marca: "72162417", desc: "ESCADA MOVEL", qtd: 1, kgUn: 50 }];
    const r = simularCarga({ lista, geometria: {}, perfil: "recomendado", prefixo: "T118", ajustes: { 72162417: { medidas: { C: 3200, L: 600, A: 200 }, embalagem: "caixa" } } });
    expect(r.estimadas).toHaveLength(0); const m = r.cargas[0].itens[0].membros[0]; expect([m.C, m.L, m.A]).toEqual([3200, 600, 200]); expect(r.cargas[0].itens[0].tipo).toBe("CAIXA");
  });
  it("engradado forçado: o pacote de guarda-corpo vira engradado deitado", () => {
    const lista = [{ marca: "T118D1", desc: "G.C", qtd: 3, kgUn: 60 }];
    const r = simularCarga({ lista, geometria: g, perfil: "recomendado", prefixo: "T118", ajustes: { T118D1: { embalagem: "engradado" } }, opcoes: { gcModo: "topo" } });
    expect(r.cargas[0].itens[0].tipo).toBe("ENGRADADO");
  });
});
