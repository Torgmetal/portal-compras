import { describe, it, expect } from "vitest";
import { calcularLqc, analiseDeCenarios, fluxoDeCaixa } from "@/lib/lqc";

// ⚠⚠ TESTE DE CARACTERIZAÇÃO, NÃO DE CORRETUDE.
//
// `calcularLqc` tem 568 linhas e complexidade acima de 100 — é a função que
// forma o preço da proposta comercial. Nenhum destes números foi conferido
// contra a planilha: eles são o que a função devolve HOJE, congelado.
//
// Para que serve: quebrar essa função em partes menores é o item mais caro do
// burn-down de complexidade, e é o tipo de mudança em que um sinal trocado não
// aparece em lugar nenhum — sai uma proposta com preço errado. Se o snapshot
// mudar durante uma refatoração que deveria preservar comportamento, a
// refatoração está errada, e não o teste.
//
// Se um número aqui mudar de propósito (regra de negócio nova), atualize com
// `npx vitest -u` E diga no commit qual regra mudou e por quê.

// Um estudo pequeno mas que exercita os caminhos que importam: duas classes de
// peso, área informada num item e deduzida por coeficiente no outro, uma área
// desmarcada (tem de sair da conta e continuar no estudo), pintura com duas
// camadas, terceirizado e frete.
/** Todos os caminhos do objeto cujo valor é NaN. Vazio é o que se espera. */
function caminhosComNaN(valor, caminho = "") {
  if (typeof valor === "number") return Number.isNaN(valor) ? [caminho] : [];
  if (Array.isArray(valor)) return valor.flatMap((v, i) => caminhosComNaN(v, `${caminho}[${i}]`));
  if (valor && typeof valor === "object") {
    return Object.entries(valor).flatMap(([k, v]) => caminhosComNaN(v, caminho ? `${caminho}.${k}` : k));
  }
  return [];
}

const ESTUDO = {
  resumos: [
    { ativo: true, descricao: "Cobertura", estrutura: "COBERTURA", classificacao: "MEDIO",
      perfil: "W", quantidade: 10, unidades: 1, pesoUnit: 500, areaM2: 160 },
    { ativo: true, descricao: "Guarda-corpo", estrutura: "GUARDA CORPO", classificacao: "LEVE",
      perfil: "TUBO", quantidade: 20, unidades: 1, pesoUnit: 50 },
    { ativo: false, descricao: "Galeria fora do escopo", estrutura: "PLATAFORMA",
      classificacao: "PESADO", perfil: "W", quantidade: 5, unidades: 1, pesoUnit: 800 },
  ],
  tintas: [
    { camada: "PRIMER", perda: 45, solidos: 60, peliculaSeca: 100, precoLitro: 42, precoDiluente: 12 },
    { camada: "ACABAMENTO", perda: 45, solidos: 55, peliculaSeca: 60, precoLitro: 58, precoDiluente: 12 },
  ],
  faturamento: { materiaPrima: "TORG", fixadores: "TORG", tintas: "TORG", itensComerciais: "TORG" },
  alavancas: { lucro: 12, despesasFixas: 8, comissao: 3, factoring: 2 },
};

describe("calcularLqc — snapshot do estudo de referência", () => {
  const r = calcularLqc(ESTUDO);

  it("o peso e a área saem do quantitativo, sem a linha desmarcada", () => {
    // 10×500 + 20×50 = 6000 kg. A galeria (4000 kg) está desmarcada e não conta.
    expect(r.pesoTotal).toBe(6000);
    expect(r.pesoTotal).not.toBe(10000);
  });

  it("o escopo diz quantas áreas entraram e quanto peso ficou de fora", () => {
    expect(r.escopo).toEqual({ selecionadas: 2, total: 3, pesoFora: 4000 });
  });

  it("nenhum valor sai como NaN", () => {
    expect(caminhosComNaN(r)).toEqual([]);
  });

  it("o resultado inteiro está congelado", () => {
    expect(r).toMatchSnapshot();
  });
});

describe("calcularLqc — bordas que não podem virar NaN", () => {
  it("estudo vazio devolve zeros, nunca NaN", () => {
    const r = calcularLqc({});
    expect(r.pesoTotal).toBe(0);
    expect(Number.isNaN(r.pesoTotal)).toBe(false);
    expect(r).toMatchSnapshot();
  });

  it("sem argumento nenhum não explode", () => {
    expect(() => calcularLqc()).not.toThrow();
  });

  it("todas as áreas desmarcadas: escopo zero, não divisão por zero", () => {
    const r = calcularLqc({ ...ESTUDO, resumos: ESTUDO.resumos.map((l) => ({ ...l, ativo: false })) });
    expect(r.pesoTotal).toBe(0);
    // `null` é legítimo em campo opcional; NaN nunca é — é o que vira "R$ NaN"
    // na proposta. JSON.stringify serializa NaN como null, então procuramos
    // andando no objeto.
    expect(caminhosComNaN(r)).toEqual([]);
  });
});

describe("analiseDeCenarios e resultadoDoCenario — congelados", () => {
  const r = calcularLqc(ESTUDO);
  it("a análise dos cenários está congelada", () => {
    expect(analiseDeCenarios(r.custoTorg ?? 0, r.custoDireto ?? 0, ESTUDO)).toMatchSnapshot();
  });
});

describe("fluxoDeCaixa — congelado", () => {
  it("o fluxo de um estudo simples está congelado", () => {
    const r = calcularLqc(ESTUDO);
    const f = fluxoDeCaixa(
      { pesoTotal: r.pesoTotal, preco: 500000, impostos: 50000, custosExternos: 200000, ...r },
      { mesesFabricacao: 3, mesesProjeto: 1 }
    );
    expect(f).toMatchSnapshot();
  });
});
