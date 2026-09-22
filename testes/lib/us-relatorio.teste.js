import { describe, expect, it } from "vitest";
import { camposCabecalhoUS, progressoPreenchimentoUS } from "@/lib/us-relatorio";
import { extractText } from "unpdf";
import { gerarUSPDF } from "@/lib/relatorio-us-pdf";

describe("camposCabecalhoUS", () => {
  it("leva a marca ao TAG e separa o cabeçote salvo pelo formulário", () => {
    expect(camposCabecalhoUS({
      marcas: ["T113A1"],
      resultados: {
        apModelo: "Mitech MDF350B",
        apSerie: "FD10012912",
        cbModelo: "Mitech angular 20x22 · 70° · 2 MHz",
        cbAngulo: "70",
        cbSerie: "2206365",
      },
    })).toMatchObject({
      tag: "T113A1",
      apFabricante: "Mitech",
      apModelo: "MDF350B",
      apSerie: "FD10012912",
      cbFabricante: "Mitech",
      cbModelo: "angular",
      cbDimensoes: "20x22",
      cbAngulo: "70°",
      cbFrequencia: "2 MHz",
      cbSerie: "2206365",
    });
  });

  it("preserva os campos explícitos e aplica procedimento e norma do US", () => {
    expect(camposCabecalhoUS({
      marcas: ["T1"],
      resultados: {
        tag: "TAG-CLIENTE",
        procedimento: "PI-QUA-003 - R1",
        norma: "AWS D1.1",
        cbFabricante: "Outro",
        cbModelo: "Modelo X",
        cbDimensoes: "10x12",
        cbFrequencia: "4 MHz",
      },
    })).toMatchObject({
      tag: "TAG-CLIENTE",
      procedimento: "PI-QUA-003 - R1",
      norma: "AWS D1.1",
      cbFabricante: "Outro",
      cbModelo: "Modelo X",
      cbDimensoes: "10x12",
      cbFrequencia: "4 MHz",
    });
  });

  it("corrige o vínculo legado do PO-06 no ultrassom", () => {
    const campos = camposCabecalhoUS({ resultados: { procedimento: "PO-06 Ensaio Visual de Solda - R1" } });
    expect(campos.procedimento).toBe("PI-QUA-003 - Procedimento de US");
    expect(campos.norma).toBe("AWS D1.1");
    expect(campos.criterio).toBe("AWS D1.1");
  });
});

describe("PDF de ultrassom", () => {
  it("imprime os dados salvos no RUS-113-001 nos campos corretos", async () => {
    const pdf = await gerarUSPDF({ rel: {
      codigo: "RUS-113-001", opNumero: "113", marcas: ["T113A1"], linhas: [], equipamentos: [],
      resultados: {
        local: "TORG METAL LTDA", apModelo: "Mitech MDF350B", apSerie: "FD10012912",
        cbModelo: "Mitech angular 20x22 · 70° · 2 MHz", cbAngulo: "70", cbSerie: "2206365",
        acoplante: "Metilcelulose em água", blocoPadrao: "V2", ganhoVarredura: "80",
        procedimento: "PO-06 Ensaio Visual de Solda - R1",
      },
    }});
    const { text } = await extractText(new Uint8Array(pdf), { mergePages: true });
    for (const esperado of ["T113A1", "PI-QUA-003", "AWS D1.1", "MDF350B", "20x22", "2 MHz", "FD10012912", "2206365"]) {
      expect(text).toContain(esperado);
    }
  });
});

describe("preenchimento móvel do ultrassom", () => {
  it("mostra exatamente quais campos obrigatórios ainda faltam", () => {
    expect(progressoPreenchimentoUS({
      carregamento: "Estaticamente carregada", apModelo: "Mitech MDF350B", apSerie: "FD10012912",
      cbModelo: "Mitech angular 20x22 · 70° · 2 MHz", cbSerie: "2206365",
      cbAngulo: "70", acoplante: "Metilcelulose em água", blocoPadrao: "V2", local: "TORG METAL LTDA",
    })).toEqual({ preenchidos: 9, total: 10, faltando: ["Ganho de varredura"] });
  });
});

// Vitor (22/09/2026), olhando o seletor de cabeçote no relatório de US: "precisamos tirar esse
// Mitech, pois já informamos a marca dele antes — deixar apenas angular 20x22 70 · 2"; e, em
// seguida, "aliás o ângulo não precisa — grau, no caso". O rótulo do seletor perde a MARCA e o
// símbolo de grau; a marca continua no documento (campo CABEÇOTE — FABRICANTE) e no dado.
describe("rótulo do cabeçote na tela", () => {
  it("mostra só modelo, ângulo e frequência — sem marca e sem o símbolo de grau", async () => {
    const { CABECOTES, rotuloCabecote } = await import("@/lib/us-campos");
    const angular70 = CABECOTES.find((c) => c.fabricante === "Mitech" && c.angulo === 70);
    expect(rotuloCabecote(angular70)).toBe("angular 20x22 · 70 · 2 MHz");
    const normal = CABECOTES.find((c) => c.angulo == null);
    expect(rotuloCabecote(normal)).toBe("normal Ø24 · 2 MHz");
  });

  it("nenhum modelo carrega a marca no nome, e toda entrada tem fabricante", async () => {
    const { CABECOTES } = await import("@/lib/us-campos");
    for (const c of CABECOTES) {
      expect(c.fabricante, JSON.stringify(c)).toBeTruthy();
      expect(c.modelo, c.modelo).not.toMatch(/^(Mitech|Doppler|Krautkramer)\b/i);
    }
  });

  // ⚠ Mitech e Doppler têm "angular 20x22" nos mesmos três ângulos: sem a marca no rótulo, as
  // opções ficam idênticas. Por isso a lista é agrupada por fabricante (optgroup) e o formulário
  // grava a marca junto — senão o documento perderia de quem é o cabeçote.
  it("o rótulo curto se repete entre marcas — é o que obriga o agrupamento", async () => {
    const { CABECOTES, rotuloCabecote } = await import("@/lib/us-campos");
    const rotulos = CABECOTES.map(rotuloCabecote);
    expect(new Set(rotulos).size).toBeLessThan(rotulos.length);
  });
});

describe("cabeçote salvo no formato curto", () => {
  it("o documento continua com marca, dimensões, ângulo e frequência", () => {
    expect(camposCabecalhoUS({
      marcas: ["T118A1"],
      resultados: { cbFabricante: "Mitech", cbModelo: "angular 20x22 · 70 · 2 MHz", cbSerie: "2206365" },
    })).toMatchObject({
      cbFabricante: "Mitech",
      cbModelo: "angular",
      cbDimensoes: "20x22",
      cbAngulo: "70°",
      cbFrequencia: "2 MHz",
    });
  });

  // ⚠ Relatório antigo tem "Mitech angular 20x22 · 70° · 2 MHz" gravado; continua sendo lido.
  it("o formato antigo, com marca e grau, continua sendo decomposto", () => {
    expect(camposCabecalhoUS({ marcas: ["T1"], resultados: { cbModelo: "Mitech angular 20x22 · 70° · 2 MHz" } }))
      .toMatchObject({ cbFabricante: "Mitech", cbModelo: "angular", cbDimensoes: "20x22", cbAngulo: "70°", cbFrequencia: "2 MHz" });
  });
});

// Vitor (22/09/2026), no cabeçalho do RUS: "pode tirar esse AWS a frente do procedimento" — a
// norma já tem campo próprio ao lado ("NORMA DE REFERÊNCIA: AWS D1.1"); repeti-la no nome do
// procedimento é dizer duas vezes a mesma coisa num documento que o cliente confere linha a linha.
describe("procedimento no cabeçalho", () => {
  it("é só o documento do SGQ, sem a norma colada no fim", () => {
    const { procedimento } = camposCabecalhoUS({ marcas: ["T1"], resultados: {} });
    expect(procedimento).toBe("PI-QUA-003 - Procedimento de US");
    expect(procedimento).not.toMatch(/AWS/i);
  });

  it("relatório antigo, gravado com a norma no fim, é normalizado", () => {
    expect(camposCabecalhoUS({ marcas: ["T1"], resultados: { procedimento: "PI-QUA-003 - Procedimento de US AWS D1.1" } }).procedimento)
      .toBe("PI-QUA-003 - Procedimento de US");
  });

  it("procedimento digitado pelo inspetor é preservado", () => {
    expect(camposCabecalhoUS({ marcas: ["T1"], resultados: { procedimento: "PI-QUA-003 - R2" } }).procedimento).toBe("PI-QUA-003 - R2");
  });
});

// Vitor (22/09/2026), no campo Espessura do RUS: "preciso que você coloque o seletor de espessura
// de chapas de 8 até 3 polegadas". A lista é a das chapas que a casa compra — conferida contra o
// banco (RMItem e PecaConjunto): 8, 9,50, 12,50, 16, 19, 22,40, 25,40, 31,50, 38, 44,50 mm são as
// que aparecem de verdade; 50,80, 63,50 e 76,20 completam até as 3".
describe("espessuras de chapa", () => {
  it("vai de 8,00 mm a 76,20 mm (3\"), em ordem e sem repetir", async () => {
    const { ESPESSURAS_CHAPA, valorEspessura } = await import("@/lib/us-campos");
    const mm = ESPESSURAS_CHAPA.map((e) => e.mm);
    expect(mm[0]).toBe(8);
    expect(mm.at(-1)).toBeCloseTo(76.2, 2);
    expect([...mm].sort((a, b) => a - b)).toEqual(mm);
    expect(new Set(mm).size).toBe(mm.length);
    expect(valorEspessura(ESPESSURAS_CHAPA[0])).toBe("8,00 mm");
  });

  it("o rótulo traz a polegada comercial quando existe; o valor gravado é só o milímetro", async () => {
    const { ESPESSURAS_CHAPA, rotuloEspessura, valorEspessura } = await import("@/lib/us-campos");
    const meia = ESPESSURAS_CHAPA.find((e) => e.mm === 12.5);
    expect(rotuloEspessura(meia)).toBe('12,50 mm (1/2")');
    expect(valorEspessura(meia)).toBe("12,50 mm");
    const tres = ESPESSURAS_CHAPA.at(-1);
    expect(rotuloEspessura(tres)).toBe('76,20 mm (3")');
  });
});

// "O modelo do aparelho e do cabeçote é sempre o mesmo, pode deixar fixo" (Vitor, 22/09/2026).
describe("aparelhagem padrão do ultrassom", () => {
  it("é a da casa, com os números de série do equipamento", async () => {
    const { APARELHAGEM_PADRAO_US } = await import("@/lib/us-campos");
    expect(APARELHAGEM_PADRAO_US).toMatchObject({
      apModelo: "Mitech MDF350B", apSerie: "FD10012912",
      cbFabricante: "Mitech", cbModelo: "angular 20x22 · 70 · 2 MHz", cbSerie: "2206365",
    });
  });

  // ⚠ o ângulo real é MEDIDO no bloco padrão — preenchê-lo de antemão seria dar por medido o que
  // ninguém mediu, o mesmo erro de já marcar a peça como conferida.
  it("não traz o ângulo real medido", async () => {
    const { APARELHAGEM_PADRAO_US } = await import("@/lib/us-campos");
    expect(APARELHAGEM_PADRAO_US.cbAngulo).toBeUndefined();
  });

  it("o cabeçote padrão existe na lista do seletor", async () => {
    const { APARELHAGEM_PADRAO_US, APARELHOS, cabecotesPorFabricante } = await import("@/lib/us-campos");
    expect(APARELHOS).toContain(APARELHAGEM_PADRAO_US.apModelo);
    const rotulos = cabecotesPorFabricante().flatMap((g) => g.itens.map((i) => i.rotulo));
    expect(rotulos).toContain(APARELHAGEM_PADRAO_US.cbModelo);
  });
});

// Vitor (22/09/2026), sobre os campos da junta no RUS: "para o processo de soldagem, deixar o
// seletor GMAW ou FCAW; o tipo de junta deixar sempre Topo; para o tipo de chanfro deixar seletor
// para X ou V; na técnica de ensaio pode deixar sempre fixo Direto".
describe("a junta ensaiada — listas e padrões da casa", () => {
  it("processo de soldagem: só os dois que a Torg usa", async () => {
    const { PROCESSOS_SOLDA } = await import("@/lib/us-campos");
    expect(PROCESSOS_SOLDA).toEqual(["GMAW", "FCAW"]);
  });

  it("chanfro: X ou V", async () => {
    const { CHANFROS } = await import("@/lib/us-campos");
    expect(CHANFROS).toEqual(["X", "V"]);
  });

  it("junta e técnica nascem preenchidas — Topo e Direto", async () => {
    const { JUNTA_PADRAO, TECNICA_PADRAO, APARELHAGEM_PADRAO_US } = await import("@/lib/us-campos");
    expect(JUNTA_PADRAO).toBe("Topo");
    expect(TECNICA_PADRAO).toBe("Direto");
    expect(APARELHAGEM_PADRAO_US).toMatchObject({ tipoJunta: "Topo", tecnica: "Direto" });
  });

  // ⚠ o processo e o chanfro NÃO têm padrão: um é GMAW ou FCAW conforme a solda, o outro X ou V
  // conforme o chanfro real. Escolher por quem inspeciona seria preencher laudo no lugar dele.
  it("processo e chanfro ficam em branco até o inspetor escolher", async () => {
    const { APARELHAGEM_PADRAO_US } = await import("@/lib/us-campos");
    expect(APARELHAGEM_PADRAO_US.processoSolda).toBeUndefined();
    expect(APARELHAGEM_PADRAO_US.chanfro).toBeUndefined();
  });
});
