// Pacotes de até 1,2 m, madeira entre as camadas, cintas — e aço nunca direto no assoalho. Vitor (24/09/2026):
// "precisamos fazer pacotes das peças com no máximo 1,2 de largura para facilitar o carregamento, travar com madeiras no
// meio, cintas, e nunca podemos colocar as peças diretamente no assoalho, sempre com madeira para conseguir retirar com
// facilidade".
import { describe, it, expect } from "vitest";
import { expandirPecas } from "@/lib/carga/geometria";
import { montarUnidades } from "@/lib/carga/unidades";
import { novoContexto } from "@/lib/carga/empacotar";
import { simularCarga } from "@/lib/carga/simular";
import { madeiraDaUnidade } from "@/lib/carga/madeira";
import { montarUnidade } from "@/lib/carga/cena-carga";
import { recalcularMontagem } from "@/lib/carga/montagem-manual";
import { PERFIS, PAC, MEDIDAS, VEICULOS, larguraDoPacote } from "@/lib/carga/premissas";

// dims no IFC (Y para cima): [comprimento, altura, largura] — perfil viaja com a alma em pé
const geo = (C, A, L) => ({ dimsEixos: [C, A, L], temGeo: true });
const unidades = (lista, g) => montarUnidades(expandirPecas(lista, g), PERFIS.recomendado, "topo", novoContexto({ prefixo: "T118" }));

describe("pacote de até 1,2 m, com madeira entre as camadas", () => {
  it("a largura deixa dois pacotes lado a lado na carreta (2,45 m, com a folga de cada um)", () => {
    const L = larguraDoPacote(VEICULOS.carreta);
    expect(L).toBeLessThanOrEqual(1200); expect(2 * (L + MEDIDAS.FOLGA)).toBeLessThanOrEqual(VEICULOS.carreta.L);
    expect(L).toBe(1140);
  });

  it("monta em fileiras: a viga larga do grupo não deixa as estreitas soltas", () => {
    const un = unidades([{ marca: "T118B1", desc: "VIGA", qtd: 4, kgUn: 60 }, { marca: "T118B2", desc: "VIGA", qtd: 1, kgUn: 90 }],
      { T118B1: geo(3000, 200, 250), T118B2: geo(3000, 200, 600) });
    expect(un.filter((u) => u.tipo === "PECA")).toHaveLength(0);
    for (const u of un) { expect(u.tipo).toBe("PACOTE"); expect(u.L).toBeLessThanOrEqual(larguraDoPacote()); }
  });

  it("fileira de cima vai sobre caibro: a camada sobe a altura da peça mais a madeira", () => {
    const [p] = unidades([{ marca: "T118B1", desc: "VIGA", qtd: 4, kgUn: 80 }], { T118B1: geo(4000, 200, 400) });
    const camadas = [...new Set(p.membros.map((m) => m.dy))].sort((a, b) => a - b);
    expect(camadas).toEqual([0, 200 + PAC.madeira]); // 2 por fileira (400 + 12 + 400), a segunda sobre o caibro
    expect(p.A).toBe(2 * 200 + PAC.madeira); expect(p.madeiraEntre).toBe(PAC.madeira);
  });

  it("peça sozinha na sua descrição junta com a mesma família da fase", () => {
    const un = unidades([{ marca: "T118B1", desc: "VIGA EL. +1000", qtd: 1, kgUn: 60 }, { marca: "T118B2", desc: "VIGA EL. +2000", qtd: 1, kgUn: 60 }],
      { T118B1: geo(3000, 200, 250), T118B2: geo(3100, 200, 250) });
    expect(un).toHaveLength(1); expect(un[0].tipo).toBe("PACOTE"); expect(un[0].rotulo).toContain("VIGA");
  });

  it("fica solta a peça mais larga que o pacote, a longarina em V e a que não cabe na carreta", () => {
    const larga = unidades([{ marca: "T118C1", desc: "SUPORTE", qtd: 2, kgUn: 200 }], { T118C1: geo(3000, 300, 1300) });
    expect(larga.every((u) => u.tipo === "PECA")).toBe(true);
    const longa = unidades([{ marca: "T118A1", desc: "COLUNA", qtd: 2, kgUn: 900 }], { T118A1: geo(13000, 400, 400) });
    expect(longa.every((u) => u.tipo === "PECA" && u.transporte === "carreta14")).toBe(true); // coluna de 12,5–14 m nunca em feixe
  });
});

describe("aço nunca direto no assoalho", () => {
  it("o volume de aço no chão fica sobre caibros; a caixa de madeira assenta na própria base", () => {
    const r = simularCarga({ lista: [{ marca: "T118B1", desc: "VIGA", qtd: 4, kgUn: 80 }, { marca: "T118C1", desc: "CANTONEIRA", qtd: 10, kgUn: 4 }],
      geometria: { T118B1: geo(4000, 200, 400), T118C1: geo(800, 50, 50) }, perfil: "recomendado", prefixo: "T118" });
    const itens = r.cargas.flatMap((c) => c.itens), noChao = itens.filter((u) => !(u.nivelPilha > 0));
    const aco = noChao.filter((u) => u.tipo !== "CAIXA"), caixa = noChao.filter((u) => u.tipo === "CAIXA");
    expect(aco.length).toBeGreaterThan(0);
    for (const u of aco) { expect(u.y).toBe(MEDIDAS.MADEIRA); expect(u.caibros.length).toBeGreaterThanOrEqual(2); for (const cb of u.caibros) expect(cb.y0).toBe(0); }
    for (const u of caixa) expect(u.y).toBe(0);
  });

  it("a madeira conta o caibro entre as camadas do pacote", () => {
    const [p] = unidades([{ marca: "T118B1", desc: "VIGA", qtd: 4, kgUn: 80 }], { T118B1: geo(4000, 200, 400) });
    const umaCamada = { ...p, membros: p.membros.map((m) => ({ ...m, dy: 0 })) };
    expect(madeiraDaUnidade(p, VEICULOS.carreta).caibro).toBeGreaterThan(madeiraDaUnidade(umaCamada, VEICULOS.carreta).caibro);
  });

  it("o 3D desenha o caibro entre as camadas do pacote", () => {
    const [p] = unidades([{ marca: "T118B1", desc: "VIGA", qtd: 4, kgUn: 80 }], { T118B1: geo(4000, 200, 400) });
    const posto = { ...p, x: 30, y: MEDIDAS.MADEIRA, z: 30 }, conta = (g) => { let n = 0; g.traverse((o) => { if (o.isMesh) n++; }); return n; };
    expect(conta(montarUnidade(posto, {}))).toBeGreaterThan(conta(montarUnidade({ ...posto, madeiraEntre: 0 }, {})));
  });

  it("o editor avisa a peça de aço posta direto no assoalho, e não a caixa", () => {
    const veic = { C: 12400, L: 2450, alturaUtil: 2900 };
    const aco = { id: "a", tipo: "PECA", C: 3000, L: 300, A: 200, x: 30, y: 0, z: 30, volume: 1, membros: [] };
    const caixa = { id: "c", tipo: "CAIXA", C: 1000, L: 800, A: 500, x: 3500, y: 0, z: 30, volume: 2, membros: [] };
    const r = recalcularMontagem({ veiculo: veic, itens: [aco, caixa], passos: ["a", "c"], romaneio: [] });
    expect(r.verificacoes.filter((v) => v.tipo === "madeira").map((v) => v.id)).toEqual(["a"]);
    const ok = recalcularMontagem({ veiculo: veic, itens: [{ ...aco, y: MEDIDAS.MADEIRA }, caixa], passos: ["a", "c"], romaneio: [] });
    expect(ok.verificacoes.filter((v) => v.tipo === "madeira" || v.tipo === "apoio")).toHaveLength(0);
  });
});

describe("carga encostada na cabeceira", () => {
  // Vitor (24/09/2026), vendo o 3D: "esse vão pode ser um problema no transporte? por conta das peças terem um espaço
  // para correr?" — x cresce da cabine para trás; a carga começa na cabeceira e cada volume encosta no da frente.
  it("o primeiro volume encosta na cabeceira e o seguinte no da frente — só a folga entre eles", () => {
    // só a carreta no catálogo: sobra carroceria, e a posição é escolha do motor (numa HR só existe um lugar)
    const r = simularCarga({ lista: [{ marca: "T118C1", desc: "SUPORTE", qtd: 3, kgUn: 400 }], geometria: { T118C1: geo(3000, 400, 1300) }, perfil: "recomendado", prefixo: "T118", opcoes: { veiculos: { carreta: VEICULOS.carreta } } });
    const c = r.cargas[0], chao = c.itens.filter((u) => !(u.nivelPilha > 0)).sort((a, b) => a.x - b.x);
    expect(c.veiculo.chave).toBe("carreta");
    expect(chao[0].x).toBe(MEDIDAS.FOLGA / 2);
    for (let i = 1; i < chao.length; i++) expect(chao[i].x - (chao[i - 1].x + chao[i - 1].fx)).toBeLessThanOrEqual(MEDIDAS.FOLGA + MEDIDAS.CEL);
  });
});
