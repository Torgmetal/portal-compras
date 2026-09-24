// Empilhamento pelo AÇO real (lib/carga/perfil-apoio.js). Vitor (18/09/2026): "elas podem ser colocadas uma em cima
// da outra, o que não pode é ficar voando as coisas"; (24/09/2026) "volte a lógica que fizemos nos testes" — a regra
// de 18/09 (nada em cima de topo que não seja 100% plano) mandou a OP-118 em 20 carretas de 5 peças.
import { describe, it, expect } from "vitest";
import { perfilDaMalha, perfisDasPecas } from "@/lib/carga/perfil-apoio";
import { empacotar, novoContexto } from "@/lib/carga/empacotar";
import { PERFIS, MEDIDAS } from "@/lib/carga/premissas";
import { montarCaibros } from "@/lib/carga/cena-carga";
import { recalcularMontagem } from "@/lib/carga/montagem-manual";

// malha de caixas alinhadas (Y para cima, como o Tekla): 8 vértices e 12 triângulos por caixa
function malha(...caixas) {
  const pos = [], idx = [];
  for (const [x0, y0, z0, x1, y1, z1] of caixas) {
    const b = pos.length / 3;
    for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) pos.push(x, y, z);
    const v = (i, j, k) => b + i * 4 + j * 2 + k; // i=x, j=y, k=z
    const faces = [[v(0, 0, 0), v(1, 0, 0), v(1, 0, 1), v(0, 0, 1)], [v(0, 1, 0), v(1, 1, 0), v(1, 1, 1), v(0, 1, 1)],
      [v(0, 0, 0), v(1, 0, 0), v(1, 1, 0), v(0, 1, 0)], [v(0, 0, 1), v(1, 0, 1), v(1, 1, 1), v(0, 1, 1)],
      [v(0, 0, 0), v(0, 1, 0), v(0, 1, 1), v(0, 0, 1)], [v(1, 0, 0), v(1, 1, 0), v(1, 1, 1), v(1, 0, 1)]];
    for (const [a, c, d, e] of faces) idx.push(a, c, d, a, d, e);
  }
  return { pos, idx };
}
const PERM = { X: 0, Y: 1, Z: 2 };
const peca = (id, marca, C, L, A, kg, extra = {}) => ({ id, marca, desc: marca, C, L, A, kg, perm: PERM, giro: null, temGeo: true, tipo: "PECA", classe: 1, ...extra });
const unidade = (p) => ({ ...p, rotulo: p.marca, membros: [p] });
const caminhao = (C, L) => ({ chave: "teste", C, L, alturaUtil: 2500, pesoMax: 20000 });
function carregar(pecas, malhas, veic) {
  const ctx = novoContexto({ veiculos: { teste: veic }, perfis: perfisDasPecas(pecas, malhas) });
  const us = pecas.map(unidade); ctx.porId = new Map(us.map((u) => [u.id, u]));
  return { cargas: empacotar(us, "teste", PERFIS.recomendado, ctx, [], "empilhar"), us };
}
// suporte deitado 3000 × 2000 em moldura, barras de 100 × 200: o miolo é vão. (Não se chama "quadro": pórtico,
// treliça e quadro já têm regra própria — nada sobe neles, lib/carga/classificar.js › ehQuadroVazado.)
const MOLDURA = malha([0, 0, 0, 3000, 200, 100], [0, 0, 1900, 3000, 200, 2000], [0, 0, 0, 100, 200, 2000], [2900, 0, 0, 3000, 200, 2000]);

describe("perfil do aço pela malha", () => {
  it("chapa cheia tem topo em toda a coluna; quadro tem o miolo vazio", () => {
    const chapa = perfilDaMalha(malha([0, 0, 0, 2000, 20, 1000]), { perm: PERM, giro: null, C: 2000, L: 1000, A: 20 });
    expect([...chapa.topo].every((t) => t === 20)).toBe(true);
    const q = perfilDaMalha(MOLDURA, { perm: PERM, giro: null, C: 3000, L: 2000, A: 200 });
    const meio = q.topo[Math.floor(q.nx / 2) * q.nz + Math.floor(q.nz / 2)], lado = q.topo[Math.floor(q.nx / 2) * q.nz];
    expect(meio).toBe(-1); expect(lado).toBe(200);
  });
});

describe("empilhar pelo aço, não pela caixa envolvente", () => {
  it("peça que cairia no vão da moldura não sobe nela — pela caixa ela 'voava' no miolo", () => {
    const pecas = () => [peca("q", "SUPORTE", 3000, 2000, 200, 300), peca("p", "PLACA", 1000, 800, 100, 80)];
    const malhas = { SUPORTE: MOLDURA, PLACA: malha([0, 0, 0, 1000, 100, 800]) };
    const veic = caminhao(3200, 2150); // só a moldura cabe no assoalho
    expect(carregar(pecas(), {}, veic).cargas).toHaveLength(1); // sem a malha, a caixa cheia deixava subir
    const { cargas, us } = carregar(pecas(), malhas, veic);
    expect(cargas).toHaveLength(2); expect(us[1].y).toBe(0);
  });

  it("barra sobre a moldura sobe, com cada caibro sobre as barras dela (aço, não o vão)", () => {
    const pecas = [peca("q", "SUPORTE", 3000, 2000, 200, 300), peca("b", "BARRA", 2000, 150, 150, 60)];
    const malhas = { SUPORTE: MOLDURA, BARRA: malha([0, 0, 0, 2000, 150, 150]) };
    const { cargas, us } = carregar(pecas, malhas, caminhao(3200, 2150));
    expect(cargas).toHaveLength(1);
    const b = us[1]; expect(b.y).toBe(300);
    expect(b.caibros.length).toBeGreaterThanOrEqual(2);
    for (const cb of b.caibros) expect(cb.segs.some(([, , base]) => cb.y0 - base <= MEDIDAS.CALCO)).toBe(true);
  });

  it("coluna com chapa de base: a de cima desencontra e assenta corpo sobre corpo, bem abaixo do que a caixa deixaria", () => {
    // chapa 550 × 550 × 25 numa ponta; corpo de 300 de altura e 200 de largura, centrado
    const col = malha([0, 0, 0, 25, 550, 550], [25, 125, 175, 4000, 425, 375]);
    const pecas = [peca("c1", "COL", 4000, 550, 550, 500), peca("c2", "COL", 4000, 550, 550, 500)];
    const { cargas, us } = carregar(pecas, { COL: col }, caminhao(4800, 700)); // uma coluna de largura: tem de empilhar
    expect(cargas).toHaveLength(1);
    const [c1, c2] = us;
    expect(c2.y).toBeGreaterThan(0); expect(c2.y).toBeLessThan(550 + MEDIDAS.MADEIRA); // pela caixa: 650
    expect(Math.abs(c2.x - c1.x)).toBeGreaterThan(25); // as chapas de base não caem uma sobre a outra
    for (const cb of c2.caibros) { // caibro encostado no corpo da de cima, calço de no máximo 15 cm sobre o corpo da de baixo
      expect(cb.y0).toBe(c2.y + 125 - MEDIDAS.MADEIRA);
      expect(cb.segs.every(([, , base]) => cb.y0 - base >= 0 && cb.y0 - base <= MEDIDAS.CALCO)).toBe(true);
    }
  });

  it("caibro com aço embaixo só de um lado é gangorra: a chapa larga não sobe na barra da borda", () => {
    const pecas = [peca("b", "BARRA", 3000, 100, 100, 100), peca("c", "CHAPA", 2500, 1000, 20, 60, { classe: 2 })];
    const malhas = { BARRA: malha([0, 0, 0, 3000, 100, 100]), CHAPA: malha([0, 0, 0, 2500, 20, 1000]) };
    const { us } = carregar(pecas, malhas, caminhao(3200, 2150));
    expect(us[1].y).toBe(0); // vai para o assoalho, ao lado da barra
  });
});

describe("o 3D e o editor confiam no apoio do motor enquanto ninguém mexe", () => {
  const baixo = { id: "b", tipo: "PECA", C: 3000, L: 2000, A: 200, x: 30, y: 0, z: 30, fx: 3000, fz: 2000, posMotor: [30, 0, 30], volume: 1, membros: [] };
  const cima = { id: "c", tipo: "PECA", C: 2000, L: 150, A: 150, x: 530, y: 300, z: 30, fx: 150, fz: 2000, girada: true, posMotor: [530, 300, 30], volume: 2, membros: [],
    sobre: ["b"], apoioMotor: { sobre: ["b"] }, caibros: [{ x: 600, y0: 200, z0: 0, z1: 2100, segs: [[0, 100, 200], [1900, 2000, 150]] }] };

  it("desenha o caibro na altura do motor e o calço onde o aço de baixo é mais baixo", () => {
    const ms = montarCaibros(cima, 100, [baixo]);
    expect(ms).toHaveLength(2); // caibro + um calço (50 mm no segundo apoio; o primeiro encosta)
    expect(ms[0].position.y).toBeCloseTo(0.25, 5);
    expect(montarCaibros({ ...cima, y: 350 }, 100, [baixo])).toHaveLength(0); // mexido: volta a regra da caixa (nada no nível do caibro)
  });

  it("o editor não acusa sobreposição nem falta de apoio no que o motor assentou; acusa quando alguém mexe", () => {
    const veic = caminhao(3200, 2150);
    const ok = recalcularMontagem({ veiculo: veic, itens: [baixo, cima], passos: ["b", "c"], romaneio: [] });
    expect(ok.verificacoes.filter((v) => v.tipo === "apoio" || v.tipo === "colisao")).toHaveLength(0);
    const mexido = recalcularMontagem({ veiculo: veic, itens: [baixo, { ...cima, y: 250 }], passos: ["b", "c"], romaneio: [] });
    expect(mexido.verificacoes.some((v) => v.id === "c" && v.tipo === "apoio")).toBe(true);
  });
});
