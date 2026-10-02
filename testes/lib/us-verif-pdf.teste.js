// A verificação do relatório de ULTRASSOM (02/10/2026) gerou o RUS nos limites — 40 peças, 8 indicações,
// 7 fotos, assinatura desenhada, 6 e 12 instrumentos, indicações do celular sem laudo — e achou: as
// assinaturas da última folha saindo do papel, as folhas da tabela sem assinatura, o tipo de estrutura e
// o ganho de varredura gravados e nunca impressos, a observação riscada pela borda na 2ª linha, o
// "Metilcelul..." em todo RUS, o TAG vazio virando a lista das 40 marcas cortada, a folha de fotos com
// os papéis de outro relatório, o REC pintado de vermelho como reprovado e o "FOLHA x DE y" que não
// contava as fotos. Aqui cada caso é gerado e o PDF é LIDO de volta — o texto, a posição e a cor.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getDocumentProxy } from "unpdf";
import { PDFDocument, PDFName, PDFArray, decodePDFRawStream } from "pdf-lib";
import { gerarPDFdoRelatorio } from "@/lib/relatorio-render";

/** Cada pedaço de texto do PDF com a folha e a posição (y a partir do pé da folha). */
async function lerPDF(bytes) {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const itens = [], paginas = [], alturas = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const pg = await pdf.getPage(p);
    const { height } = pg.getViewport({ scale: 1 });
    const { items } = await pg.getTextContent();
    for (const it of items) if (it.str.trim()) itens.push({ pagina: p, str: it.str, y: it.transform[5], altura: height });
    paginas.push(items.map((it) => it.str).join(" ").replace(/\s+/g, " "));
    alturas.push(height);
  }
  return { itens, paginas, alturas, todo: paginas.join(" ") };
}

/** O conteúdo cru (operadores) de uma folha — para ler a COR com que um texto foi escrito. */
async function conteudoDaFolha(bytes, i) {
  const doc = await PDFDocument.load(bytes);
  const page = doc.getPage(i);
  const c = page.node.get(PDFName.of("Contents"));
  const refs = c instanceof PDFArray ? c.asArray() : [c];
  return refs.map((r) => Buffer.from(decodePDFRawStream(doc.context.lookup(r)).decode()).toString("latin1")).join("\n");
}

/** A cor de preenchimento (r g b) em vigor quando o texto `hex` (WinAnsi em hexa) é escrito sozinho. */
function coresDoTexto(conteudo, hex) {
  const cores = [];
  const re = new RegExp(`<${hex}> Tj`, "gi");
  let m;
  while ((m = re.exec(conteudo))) {
    const antes = conteudo.slice(0, m.index);
    const rg = [...antes.matchAll(/([\d.]+) ([\d.]+) ([\d.]+) rg/g)].at(-1);
    cores.push(rg ? rg.slice(1, 4).map(Number) : null);
  }
  return cores;
}
const perto = (c, alvo) => c && c.every((v, i) => Math.abs(v - alvo[i]) < 0.02);

// sem rede no teste: a assinatura desenhada só precisa EXISTIR para o bloco crescer de 54 para 118 pt
beforeAll(() => vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("sem rede no teste"); })));
afterAll(() => vi.unstubAllGlobals());

const MARCAS = Array.from({ length: 40 }, (_, i) => (i < 32 ? `T103A${i + 1}` : `T103B${i - 31}`));
const IND = (marca, n, o = {}) => ({
  marca, indicacao: String(n), angulo: "70", face: "A", comprimento: "18", db_indicacao: "52", db_referencia: "48",
  percurso: "62", profundidade: "21.5", dist_x: "4", dist_y: "135", laudo: "R", soldador: "José da Silva", sinete: "S-04",
  nivel: "1", obs: "Falta de fusão na raiz", ...o,
});
const OBS = "Ensaio 100% das juntas de topo das colunas e vigas principais do PR-03 (PIT rev.2, item 7). "
  + "Indicações reprovadas registradas conforme PI-QUA-003 item 15.1; juntas sem indicação reprovável listadas com laudo A. "
  + "As juntas T103A5, T103A9 e T103A14 seguem para reparo (RNC aberta) e reensaio após 48 h. Temperatura da peça 28 °C. FIM-DA-OBSERVACAO.";
const OBS_LINHA = "Falta de penetração em 30 mm na raiz, face A, a 1250 mm do eixo Y, com reparo previsto pela RNC 045 e reensaio após 48 horas de resfriamento";
const instrumentos = (n) => Array.from({ length: n }, (_, i) => ({ id: `u${i}`, nome: `Instrumento de ensaio número ${i + 1}`, certificado: `CAL-2026/07${String(i + 1).padStart(2, "0")}` }));
const palavras = (n) => Array.from({ length: n }, (_, i) => `palavra${String(i + 1).padStart(4, "0")}`).join(" ");

const LINHAS = [
  IND("T103A5", 1),
  IND("T103A5", 2, { angulo: "60", face: "B", comprimento: "9", obs: "Inclusão de escória alongada" }),
  IND("T103A9", 1, { comprimento: "25", obs: "Trinca transversal no reforço — reparo obrigatório antes da pintura" }),
  IND("T103A14", 1, { angulo: "45", face: "C", sinete: "S-11", soldador: "Marcos Pereira", obs: "Porosidade agrupada" }),
  IND("T103A14", 2, { angulo: "45", face: "C", comprimento: "7", laudo: "REC", obs: "Indicação no limite — recomendado LP complementar na face C" }),
  IND("T103A20", 1, { laudo: "A", obs: "Crítica à fratura: registrada até 6 dB abaixo (item 15.1)" }),
  IND("T103A27", 1, { comprimento: "30", inspecionado: "350", obs: OBS_LINHA }),
  IND("T103B3", 1, { angulo: "60", face: "D", sinete: "S-11", obs: "Falta de fusão lateral" }),
];

const relUS = (extra = {}) => {
  const base = {
    id: "teste-us", tipo: "ULTRASSOM", codigo: "RUS-103-004", revisao: 0, emitidoEm: new Date("2026-10-01T12:00:00Z"),
    opNumero: "103", marcas: MARCAS, inspetor: "Alexandre Stival", resultadoInspecao: "REPROVADO",
    observacoes: OBS, equipamentos: instrumentos(4), linhas: LINHAS,
    resultados: {
      desenho: "T103-DE-001 R2, T103-DE-002 R1, T103-DE-007 R0", tag: "TQ-4501 / Pipe-rack PR-03 eixo 1-12",
      procedimento: "PI-QUA-003 Rev.1", norma: "AWS D1.1:2020", criterio: "AWS D1.1 Tabela 8.2 (estática)",
      local: "TORG METAL LTDA — Galpão 2", tecnica: "Direto", acoplante: "Metilcelulose em água", blocoPadrao: "V2 nº 1123",
      apFabricante: "Mitech", apModelo: "Mitech MDF350B", apSerie: "FD10012912",
      cbFabricante: "Mitech", cbModelo: "angular 20x22 · 70 · 2 MHz", cbAngulo: "69.5", cbSerie: "2206365",
      material: "ASTM A572 Gr.50", espessura: "25,40 mm", metalAdicao: "E71T-1C (AWS A5.20)", processoSolda: "FCAW", tipoJunta: "Topo", chanfro: "X",
      carregamento: "Estaticamente carregada", ganhoVarredura: "14",
    },
  };
  return { ...base, ...extra, resultados: { ...base.resultados, ...(extra.resultados || {}) } };
};
const OBRA = { cliente: "TMSA Tecnologia em Movimentação S.A.", obra: "Terminal de grãos Torocuá – Ñacunday · pipe-rack PR-03", refCliente: "TPR00870 / TPR00871" };
const assinou = new Date("2026-10-01T15:20:00Z");
const ASSINATURAS_DESENHADAS = [
  { setor: "Inspetor", nome: "Alexandre Stival", assinadoEm: assinou, imagemUrl: "https://exemplo.invalid/a.png" },
  { setor: "Torg Metal", nome: "Geraldo Tank", assinadoEm: assinou, imagemUrl: "https://exemplo.invalid/b.png" },
  { setor: "Cliente", nome: "Davi Rocha (TMSA)", assinadoEm: null, imagemUrl: null },
];
const ASSINATURAS_SEM_IMAGEM = ASSINATURAS_DESENHADAS.map((a) => ({ ...a, imagemUrl: null }));
const FOTOS = Array.from({ length: 7 }, (_, i) => ({ url: null, marca: `T103A${i + 1}`, observacao: `Foto número ${i + 1} do ensaio` }));

const gerar = (rel, extra = {}) => gerarPDFdoRelatorio({ rel, fotos: [], assinaturas: null, ...OBRA, ...extra });

/** Todo texto dentro do papel: nada abaixo da margem de baixo nem acima da de cima. */
function dentroDoPapel(itens) {
  for (const it of itens) {
    expect(it.y, `"${it.str}" na folha ${it.pagina}`).toBeGreaterThanOrEqual(28);
    expect(it.y, `"${it.str}" na folha ${it.pagina}`).toBeLessThanOrEqual(it.altura - 28);
  }
}

describe("RUS — as assinaturas cabem, e saem em todas as folhas", () => {
  it("40 peças, 8 indicações, 7 fotos e assinatura desenhada: nome e data dentro do papel em TODAS as folhas", async () => {
    const { itens, paginas } = await lerPDF(await gerar(relUS(), { fotos: FOTOS, assinaturas: ASSINATURAS_DESENHADAS }));
    dentroDoPapel(itens);
    paginas.forEach((t, i) => {
      expect(t, `folha ${i + 1}`).toContain("Alexandre Stival");
      expect(t, `folha ${i + 1}`).toContain("Geraldo Tank");
      expect(t, `folha ${i + 1}`).toContain("assinado em 01/10/2026");
    });
  });

  it.each([4, 6, 12])("%i instrumentos sem assinatura desenhada: a moldura das assinaturas não sai da folha", async (n) => {
    const { itens, paginas, todo } = await lerPDF(await gerar(relUS({ equipamentos: instrumentos(n) }), { assinaturas: ASSINATURAS_SEM_IMAGEM }));
    dentroDoPapel(itens);
    paginas.forEach((t, i) => expect(t, `folha ${i + 1}`).toContain("Controle de Qualidade:"));
    for (const e of instrumentos(n)) expect(todo).toContain(`nº ${e.certificado}`);
  });

  it("12 instrumentos, assinatura desenhada, 7 fotos e observação longa: tudo dentro do papel", async () => {
    const rel = relUS({ equipamentos: instrumentos(12), observacoes: palavras(400) });
    const { itens, paginas, todo } = await lerPDF(await gerar(rel, { fotos: FOTOS, assinaturas: ASSINATURAS_DESENHADAS }));
    dentroDoPapel(itens);
    paginas.forEach((t, i) => expect(t, `folha ${i + 1}`).toContain("Geraldo Tank"));
    for (const e of instrumentos(12)) expect(todo).toContain(`nº ${e.certificado}`);
    for (let i = 1; i <= 400; i++) expect(todo).toContain(`palavra${String(i).padStart(4, "0")}`);
  });

  it("uma peça só, sem assinatura nenhuma: as três colunas saem em branco para assinar à mão", async () => {
    const rel = relUS({ marcas: ["T103A1"], linhas: [], resultadoInspecao: "APROVADO" });
    const { itens, paginas } = await lerPDF(await gerar(rel));
    dentroDoPapel(itens);
    expect(paginas).toHaveLength(1);
    expect(paginas[0]).toContain("nome / assinatura / data");
  });
});

describe("RUS — FOLHA x DE y conta todas as folhas, inclusive as de foto", () => {
  it.each([
    ["sem fotos", {}],
    ["com 7 fotos e assinatura desenhada", { fotos: FOTOS, assinaturas: ASSINATURAS_DESENHADAS }],
  ])("%s", async (_, extra) => {
    const { paginas } = await lerPDF(await gerar(relUS(), extra));
    paginas.forEach((t, i) => expect(t, `folha ${i + 1}`).toContain(`${i + 1} DE ${paginas.length}`));
  });
});

describe("RUS — a folha de fotos é do ultrassom", () => {
  it("leva o título do relatório e os MESMOS papéis das outras folhas", async () => {
    const { paginas, alturas } = await lerPDF(await gerar(relUS(), { fotos: FOTOS, assinaturas: ASSINATURAS_SEM_IMAGEM }));
    const deFoto = paginas.filter((_, i) => alturas[i] > 700); // as folhas de foto são em pé
    expect(deFoto.length).toBe(2);
    for (const t of deFoto) {
      expect(t).toContain("RELATÓRIO DE ENSAIO POR ULTRASSOM");
      expect(t).toContain("Controle de Qualidade:");
      expect(t).not.toContain("Realizado por");
      expect(t).not.toContain("Aprovado por");
    }
  });
});

describe("RUS — o que o PI-QUA-003 pede sai no cabeçalho", () => {
  it("tipo de estrutura e ganho de varredura (item 18.1) saem impressos", async () => {
    const { paginas } = await lerPDF(await gerar(relUS()));
    expect(paginas[0]).toContain("TIPO DE ESTRUTURA:");
    expect(paginas[0]).toContain("Estaticamente carregada");
    expect(paginas[0]).toContain("GANHO DE VARREDURA:");
    expect(paginas[0]).toContain("14 dB");
  });

  it("o ganho que já veio com a unidade não sai com \"dB dB\"", async () => {
    const { paginas } = await lerPDF(await gerar(relUS({ resultados: { ganhoVarredura: "14 dB" } })));
    expect(paginas[0]).toContain("14 dB");
    expect(paginas[0]).not.toContain("dB dB");
  });
});

describe("RUS — nada cortado com reticência, nada sumindo", () => {
  const principais = (l) => l.paginas.filter((_, i) => l.alturas[i] < 700);

  it("ACOPLANTE sai inteiro (o próprio padrão da casa saía \"Metilcelul...\")", async () => {
    const { paginas } = await lerPDF(await gerar(relUS()));
    expect(paginas[0]).toContain("Metilcelulose em água");
  });

  it("observação da indicação sai inteira, quebrando linha dentro da célula", async () => {
    const { todo } = await lerPDF(await gerar(relUS()));
    for (const p of OBS_LINHA.split(/\s+/)) expect(todo).toContain(p);
    for (const l of LINHAS) for (const p of l.obs.split(/\s+/)) expect(todo).toContain(p.replace(/—/g, "-"));
  });

  it("TAG vazio com 40 peças: nenhuma reticência, e toda peça está no documento", async () => {
    const lido = await lerPDF(await gerar(relUS({ resultados: { tag: "" } })));
    for (const t of principais(lido)) expect(t).not.toContain("...");
    for (const m of MARCAS) expect(lido.todo).toMatch(new RegExp(`\\b${m}\\b`));
  });

  it("DESENHO longo sai inteiro, numa linha própria (na terça parte da largura viravam oito linhas)", async () => {
    const desenho = Array.from({ length: 24 }, (_, i) => `T103-DE-${String(i + 1).padStart(3, "0")} R${i % 3}`).join(", ");
    const lido = await lerPDF(await gerar(relUS({ resultados: { desenho } })));
    for (const d of desenho.split(", ")) expect(lido.todo).toContain(d.split(" ")[0]);
    for (const t of principais(lido)) expect(t).not.toContain("...");
    dentroDoPapel(lido.itens);
    const y = (s) => lido.itens.find((it) => it.pagina === 1 && it.str === s)?.y;
    expect(y("DESENHO:")).toBeLessThan(y("FABRICANTE:"));
    // a lista inteira em até três linhas, na largura toda
    const linhasDoDesenho = new Set(lido.itens.filter((it) => it.pagina === 1 && /T103-DE-\d{3}/.test(it.str)).map((it) => Math.round(it.y)));
    expect(linhasDoDesenho.size).toBeLessThanOrEqual(3);
  });

  it("DESENHO curto continua ao lado do cliente, como no modelo", async () => {
    const lido = await lerPDF(await gerar(relUS()));
    const y = (s) => lido.itens.find((it) => it.pagina === 1 && it.str === s)?.y;
    expect(y("DESENHO:")).toBe(y("FABRICANTE:"));
  });

  it("peça de código longo sai inteira na coluna de identificação", async () => {
    const longa = "T103A1-CONJ-PRINCIPAL-EIXO12";
    const lido = await lerPDF(await gerar(relUS({ marcas: [longa, ...MARCAS.slice(1, 5)], linhas: [IND(longa, 1)] })));
    expect(lido.todo.replace(/\s+/g, "")).toContain(longa);
    for (const t of principais(lido)) expect(t).not.toContain("...");
  });

  it("observações gerais saem INTEIRAS — a longa continua na folha seguinte dizendo que é continuação", async () => {
    const obs = palavras(1500);
    const { todo, itens, paginas } = await lerPDF(await gerar(relUS({ observacoes: obs })));
    for (let i = 1; i <= 1500; i++) expect(todo).toContain(`palavra${String(i).padStart(4, "0")}`);
    expect(todo).toContain("OBSERVAÇÕES (continuação)");
    dentroDoPapel(itens);
    // o pedaço que continua TERMINA avisando; o último pedaço, não
    const comObs = paginas.filter((t) => /OBSERVAÇÕES/.test(t));
    comObs.slice(0, -1).forEach((t) => expect(t).toContain("(continua na folha seguinte)"));
    expect(comObs.at(-1)).not.toContain("(continua na folha seguinte)");
  });

  it("a tabela que não coube numa folha avisa que continua na seguinte — e a última folha da tabela, não", async () => {
    const { paginas } = await lerPDF(await gerar(relUS()));
    const comTabela = paginas.filter((t) => t.includes("DESCONTINUIDADES"));
    expect(comTabela.length).toBeGreaterThan(1);
    comTabela.slice(0, -1).forEach((t, i) => expect(t, `folha ${i + 1}`).toContain("a tabela continua na folha seguinte"));
    expect(comTabela.at(-1)).not.toContain("a tabela continua na folha seguinte");
  });

  it("a observação do modelo (5 linhas) sai inteira, até a última palavra", async () => {
    const { todo } = await lerPDF(await gerar(relUS()));
    expect(todo).toContain("FIM-DA-OBSERVACAO");
  });

  it("comprimento inspecionado lançado na indicação sai na coluna", async () => {
    const { todo } = await lerPDF(await gerar(relUS()));
    expect(todo).toMatch(/\b350\b/);
  });

  it("indicações do celular sem laudo nem soldador, TAG e desenho vazios e 6 instrumentos: gera, e nada sai do papel", async () => {
    const rel = relUS({
      resultadoInspecao: "REC", equipamentos: instrumentos(6), resultados: { tag: "", desenho: "", cbAngulo: "70°" },
      linhas: [
        { marca: "T103A5", qtd: 1, soldador: null, sinete: null, indicacao: "1", angulo: "70", face: "A", comprimento: "18", percurso: "62", db_indicacao: "52", db_referencia: "48", profundidade: "21.5", dist_x: "4", dist_y: "135", nivel: "1", laudo: null, obs: null },
        { marca: "T103A9", qtd: 1, soldador: null, sinete: null, indicacao: "1", angulo: "60", face: "B", comprimento: "25", percurso: "88", db_indicacao: "55", db_referencia: "48", profundidade: "24", dist_x: "0", dist_y: "60", nivel: "1", laudo: null, obs: "Trinca transversal" },
      ],
    });
    const lido = await lerPDF(await gerar(rel, { assinaturas: ASSINATURAS_SEM_IMAGEM }));
    dentroDoPapel(lido.itens);
    for (const t of principais(lido)) expect(t).not.toContain("...");
    expect(lido.todo).toContain("Trinca transversal");
  });
});

describe("RUS — o cabeçalho da tabela", () => {
  it("cada grupo (DECIBÉIS, DESCONTINUIDADES, DISTÂNCIA) sai UMA vez por folha de tabela, cobrindo as suas colunas", async () => {
    const desenho = Array.from({ length: 24 }, (_, i) => `T103-DE-${String(i + 1).padStart(3, "0")} R${i % 3}`).join(", ");
    for (const rel of [relUS(), relUS({ resultados: { desenho } })]) {
      const { itens, paginas, alturas } = await lerPDF(await gerar(rel));
      paginas.forEach((_, i) => {
        if (alturas[i] > 700) return; // folha de foto
        for (const g of ["DECIBÉIS", "DESCONTINUIDADES", "DISTÂNCIA"]) {
          expect(itens.filter((it) => it.pagina === i + 1 && it.str === g), `${g} na folha ${i + 1}`).toHaveLength(1);
        }
      });
    }
  });
});

describe("RUS — a cor do laudo na tabela", () => {
  it("REC sai em laranja, não no vermelho do reprovado; R em vermelho; A em verde", async () => {
    const bytes = await gerar(relUS());
    const c = await conteudoDaFolha(bytes, 0);
    const rec = coresDoTexto(c, "524543"); // "REC"
    expect(rec.length).toBeGreaterThan(0);
    for (const cor of rec) {
      expect(perto(cor, [0.78, 0.12, 0.12]), `REC em ${cor}`).toBe(false);
      expect(perto(cor, [244 / 255, 128 / 255, 31 / 255]), `REC em ${cor}`).toBe(true);
    }
    const r = coresDoTexto(c, "52"); // "R"
    expect(r.some((cor) => perto(cor, [0.78, 0.12, 0.12]))).toBe(true);
  });
});
