// Travamento para a frente: o vão diante de cada volume vira escora ou amarração. Vitor (24/09/2026), vendo o 3D: "esse
// vão pode ser um problema no transporte? por conta das peças terem um espaço para correr?" — e sobre a regra: "concordo
// com sua regra, podemos adotar". E sobre as cintas desenhadas como placas: "essas madeiras pretas que vc coloca (…) não
// vejo a forma de conseguirmos fazer aqui".
import { describe, it, expect } from "vitest";
import { extractText } from "unpdf";
import { travamentoDaCarga, textoTravamento, alturaDaCabeceira, TRAVA } from "@/lib/carga/travamento";
import { madeiraDaUnidade } from "@/lib/carga/madeira";
import { simularCarga } from "@/lib/carga/simular";
import { recalcularMontagem } from "@/lib/carga/montagem-manual";
import { montarEscoras, montarUnidade } from "@/lib/carga/cena-carga";
import { gerarModeloCargaPDF } from "@/lib/carga/modelo-carga-pdf";
import { MEDIDAS, VEICULOS } from "@/lib/carga/premissas";

const M = MEDIDAS.MADEIRA;
// volume de aço sobre o caibro do piso, 3 m × 1,14 m × 0,4 m; x cresce da cabine para trás
const vol = (id, x, extra = {}) => ({ id, tipo: "PACOTE", C: 3000, L: 1140, A: 400, fx: 3000, fz: 1140, fy: 400, x, y: M, z: 30, kg: 800, membros: [], ...extra });

describe("vão à frente de cada volume", () => {
  it("encostado no da frente, ou a até 30 cm, não pede nada", () => {
    const a = vol("a", 30), b = vol("b", 30 + 3000 + TRAVA.folga);
    expect(travamentoDaCarga([a, b]).size).toBe(0);
  });

  it("até 1,5 m contra outro volume: escorar com 2 caibros do tamanho do vão", () => {
    const a = vol("a", 30), b = vol("b", 3030 + 800);
    expect(travamentoDaCarga([a, b]).get("b")).toEqual({ tipo: "escorar", vao: 800, contra: "a", cabeceira: false });
  });

  it("mais de 1,5 m: amarrar para a frente", () => {
    const a = vol("a", 30), b = vol("b", 3030 + 2000);
    expect(travamentoDaCarga([a, b]).get("b")).toMatchObject({ tipo: "amarrar", vao: 2000, contra: "a" });
  });

  it("no assoalho, sem nada à frente, escora contra a cabeceira até 1,5 m", () => {
    expect(travamentoDaCarga([vol("a", 1000)]).get("a")).toEqual({ tipo: "escorar", vao: 1000, contra: null, cabeceira: true });
    expect(travamentoDaCarga([vol("a", 2000)]).get("a")).toMatchObject({ tipo: "amarrar", cabeceira: true });
  });

  it("o degrau: volume de cima sem nada na altura dele à frente é amarrado, mesmo com vão curto", () => {
    // a no piso na frente; b atrás, no piso; c em cima de b — na altura de c não há nada até a cabine
    const a = vol("a", 30), b = vol("b", 3030), c = vol("c", 3030, { y: M + 400 + M });
    const t = travamentoDaCarga([a, b, c]);
    expect(t.has("b")).toBe(false);
    expect(t.get("c")).toMatchObject({ tipo: "amarrar", vao: 3030, contra: null, cabeceira: true });
  });

  it("o volume da outra fileira não segura ninguém", () => {
    const a = vol("a", 30), b = vol("b", 3030 + 500, { z: 30 + 1140 + 60 });
    expect(travamentoDaCarga([a, b]).get("b")).toMatchObject({ tipo: "amarrar", vao: 3530, cabeceira: true });
  });

  it("o texto diz o que fazer e até onde", () => {
    const vols = new Map([["a", 1]]), de = (id) => vols.get(id);
    expect(textoTravamento({ tipo: "escorar", vao: 800, contra: "a", cabeceira: false }, de)).toBe("Escorar: 2 caibros de 0,8 m até o volume 01");
    expect(textoTravamento({ tipo: "escorar", vao: 1000, contra: null, cabeceira: true }, de)).toBe("Escorar: 2 caibros de 1 m até a cabeceira");
    expect(textoTravamento({ tipo: "amarrar", vao: 2000, contra: "a", cabeceira: false }, de)).toBe("Amarrar para a frente (cinta e catraca): 2 m livres até o volume 01");
    expect(textoTravamento({ tipo: "amarrar", vao: 2000, contra: null, cabeceira: true }, de)).toBe("Amarrar para a frente (cinta e catraca): 2 m livres até a cabeceira");
    expect(textoTravamento({ tipo: "amarrar", vao: 30, contra: null, cabeceira: true, acima: true, alturaCabeceira: 1800 }, de))
      .toBe("Amarrar para a frente (cinta e catraca): está acima da cabeceira (1,8 m), nada na frente na altura dele");
    expect(textoTravamento({ tipo: "amarrar", vao: 3030, contra: null, cabeceira: true, acima: true, alturaCabeceira: null }, de))
      .toBe("Amarrar para a frente (cinta e catraca): nada na frente na altura dele até a cabine");
  });
});

// Resolução CONTRAN 945/2022, art. 8º, parágrafo único: proibido rodar com carga acima do painel frontal quando a parte
// de cima pode escorregar. Vitor (24/09/2026): "usamos carretas graneleiras" — cabeceira de 1,8 m (tampas 800 + 1.000 mm).
describe("a cabeceira só segura na altura dela", () => {
  const GRANELEIRA = VEICULOS.carreta;
  it("a carreta do catálogo é a graneleira, com cabeceira de 1,8 m", () => {
    expect(GRANELEIRA.nome).toContain("graneleira"); expect(alturaDaCabeceira(GRANELEIRA)).toBe(1800);
    expect(alturaDaCabeceira(VEICULOS.truck)).toBeNull();
  });

  it("volume acima da cabeceira, sem nada à frente na altura dele, é amarrado mesmo encostado", () => {
    const t = travamentoDaCarga([vol("a", 30, { y: 1900 })], { veiculo: GRANELEIRA });
    expect(t.get("a")).toEqual({ tipo: "amarrar", vao: 30, contra: null, cabeceira: true, acima: true, alturaCabeceira: 1800 });
  });

  it("na altura da cabeceira, encostar nela basta, e o vão até 1,5 m se escora contra ela", () => {
    expect(travamentoDaCarga([vol("a", 30, { y: 600 })], { veiculo: GRANELEIRA }).size).toBe(0);
    expect(travamentoDaCarga([vol("a", 1000, { y: 600 })], { veiculo: GRANELEIRA }).get("a")).toEqual({ tipo: "escorar", vao: 1000, contra: null, cabeceira: true });
  });

  it("vale a mesma sobreposição de 30% dos volumes: passar um pouco da cabeceira ainda encosta, passar muito não", () => {
    expect(travamentoDaCarga([vol("a", 30, { y: 1500 })], { veiculo: GRANELEIRA }).size).toBe(0); // 1,5–1,9 m: 30 cm de 40 na cabeceira
    expect(travamentoDaCarga([vol("a", 30, { y: 1700 })], { veiculo: GRANELEIRA }).get("a")).toMatchObject({ tipo: "amarrar", acima: true }); // só 10 cm
  });

  it("veículo sem a altura da cabeceira: só a camada do assoalho conta como encostada nela", () => {
    expect(travamentoDaCarga([vol("a", 30)], { veiculo: VEICULOS.truck }).size).toBe(0);
    expect(travamentoDaCarga([vol("a", 30, { y: 600 })], { veiculo: VEICULOS.truck }).get("a")).toMatchObject({ tipo: "amarrar", acima: true, alturaCabeceira: null });
  });

  it("a altura vem da configuração da Expedição, com o padrão do código por baixo", async () => {
    const { catalogoDeVeiculos, linhasDeConfiguracao } = await import("@/lib/carga/config-carga");
    expect(catalogoDeVeiculos(null).veiculos.carreta.cabeceira).toBe(1800);
    expect(catalogoDeVeiculos(null).veiculos.truck.cabeceira).toBeNull();
    expect(linhasDeConfiguracao(null).find((l) => l.chave === "carreta").cabeceira).toBe(1800);
    const cat = catalogoDeVeiculos({ veiculos: [{ chave: "carreta", cabeceira: 2000 }, { chave: "truck", cabeceira: 1200 }, { chave: "toco", cabeceira: 0 }] }).veiculos;
    expect(cat.carreta.cabeceira).toBe(2000); expect(cat.truck.cabeceira).toBe(1200); expect(cat.toco.cabeceira).toBeNull();
    // configurada no truck, a 2ª camada dentro da altura dela passa a encostar
    expect(travamentoDaCarga([vol("a", 30, { y: 600 })], { veiculo: cat.truck }).size).toBe(0);
  });

  it("montagem salva antes da premissa lê a cabeceira pelo catálogo", () => {
    const salvo = { chave: "carreta", nome: "Carreta 3 eixos (carga seca)", C: 12400, L: 2450, alturaUtil: 2900 };
    const r = recalcularMontagem({ veiculo: salvo, itens: [vol("a", 30, { volume: 1, y: 1900 })], passos: ["a"], romaneio: [] });
    expect(r.romaneio[0].travamento).toMatchObject({ tipo: "amarrar", acima: true, alturaCabeceira: 1800 });
  });
});

describe("travamento na carga", () => {
  it("as escoras entram na conta de madeira", () => {
    const a = vol("a", 30), com = madeiraDaUnidade({ ...a, travamento: { tipo: "escorar", vao: 800 } }, VEICULOS.carreta);
    expect(com.caibro - madeiraDaUnidade(a, VEICULOS.carreta).caibro).toBeCloseTo(1.6, 6);
    const amarra = madeiraDaUnidade({ ...a, travamento: { tipo: "amarrar", vao: 2000 } }, VEICULOS.carreta);
    expect(amarra.caibro).toBeCloseTo(madeiraDaUnidade(a, VEICULOS.carreta).caibro, 6);
  });

  it("o romaneio do motor leva o travamento de cada volume, calculado sobre as posições finais", () => {
    const r = simularCarga({ lista: [{ marca: "T118B1", desc: "VIGA", qtd: 4, kgUn: 80 }, { marca: "T118C1", desc: "SUPORTE", qtd: 3, kgUn: 400 }],
      geometria: { T118B1: { dimsEixos: [4000, 200, 400], temGeo: true }, T118C1: { dimsEixos: [3000, 400, 1300], temGeo: true } }, perfil: "recomendado", prefixo: "T118" });
    for (const c of r.cargas) {
      const esperado = travamentoDaCarga(c.itens, { veiculo: c.veiculo });
      for (const v of c.romaneio) { expect(v).toHaveProperty("travamento"); expect(v.travamento).toEqual(esperado.get(v.id) || null); }
    }
  });

  it("mexer na montagem refaz o travamento", () => {
    const veic = { C: 12400, L: 2450, alturaUtil: 2900 };
    const longe = recalcularMontagem({ veiculo: veic, itens: [vol("a", 30, { volume: 1 }), vol("b", 3030 + 800, { volume: 2 })], passos: ["a", "b"], romaneio: [] });
    expect(longe.romaneio.find((v) => v.id === "b").travamento).toMatchObject({ tipo: "escorar", vao: 800, contra: "a" });
    const perto = recalcularMontagem({ veiculo: veic, itens: [vol("a", 30, { volume: 1 }), vol("b", 3030 + 60, { volume: 2 })], passos: ["a", "b"], romaneio: [] });
    expect(perto.romaneio.find((v) => v.id === "b").travamento).toBeNull();
  });

  it("o PDF diz como travar o volume, e o aço sobre o caibro do piso não vira 'apoio não identificado'", async () => {
    const itens = [vol("a", 30, { volume: 1, camada: 0, membros: [{ marca: "T118B1", kg: 400, desc: "VIGA" }] }),
      vol("b", 3030 + 800, { volume: 2, camada: 0, membros: [{ marca: "T118B2", kg: 400, desc: "VIGA" }], travamento: { tipo: "escorar", vao: 800, contra: "a", cabeceira: false } })];
    const { bytes } = await gerarModeloCargaPDF({ op: { numero: "DEMO" }, previo: { numero: 1 }, carga: { montagemManual: true, veiculo: { nome: "Carreta", C: 12400, L: 2450, alturaUtil: 2900 }, itens, passos: ["a", "b"], peso: 800, romaneio: [], madeira: { pecas: {} }, verificacoes: [] } });
    const { text } = await extractText(bytes, { mergePages: false }), tudo = text.join(" ");
    expect(tudo).toContain("Escorar: 2 caibros de 0,8 m até o volume 01");
    expect(tudo).not.toContain("Apoio não identificado");
    expect(tudo).toContain("No piso da carroceria, sobre caibros.");
  });
});

describe("o 3D", () => {
  it("desenha as 2 escoras do vão, e nada para quem é amarrado", () => {
    const a = vol("a", 30), b = { ...vol("b", 3030 + 800), travamento: { tipo: "escorar", vao: 800, contra: "a", cabeceira: false } };
    const escoras = montarEscoras(b, M, new Map([["a", a], ["b", b]]));
    expect(escoras).toHaveLength(2);
    for (const e of escoras) {
      expect(e.userData).toMatchObject({ pilhaDe: "b", escora: true });
      expect(e.geometry.parameters.width).toBeCloseTo(0.8, 6); // do fundo de a até a frente de b
      expect(e.position.x).toBeCloseTo((3030 + 800 - 400) / 1000, 6);
    }
    expect(montarEscoras({ ...b, travamento: { tipo: "amarrar", vao: 2000, contra: "a" } }, M)).toHaveLength(0);
    expect(montarEscoras(vol("c", 30), M)).toHaveLength(0);
  });

  it("a cinta é fita fina em volta do pacote, não placa", () => {
    const g = montarUnidade({ ...vol("p", 30), membros: [{ id: "m1", marca: "T118B1", C: 3000, L: 400, A: 200, kg: 80, dx: 0, dy: 0, dz: 0 }] }, {});
    const cintas = [], placas = [];
    g.traverse((o) => { if (o.userData.cinta) cintas.push(o); if (o.isMesh && o.material?.color?.getHex?.() === 0x222222) placas.push(o); });
    expect(cintas.length).toBeGreaterThan(0);
    for (const c of cintas) { const p = c.geometry.parameters; expect(Math.min(p.width, p.height, p.depth)).toBeLessThanOrEqual(0.01); }
    expect(placas).toHaveLength(0);
  });
});
