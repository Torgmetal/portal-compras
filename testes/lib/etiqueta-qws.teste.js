import { describe, it, expect } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { gerarEtiquetasCarregamentoPDF, MODELOS, MM } from "@/lib/etiqueta-carregamento-pdf";
import { GRADE_QWS, RODAPE } from "@/lib/etiqueta-qws-pdf";
import { ajustarTexto } from "@/lib/etiqueta-pdf-base";
import { parseEquivalenciaMarcas } from "@/lib/parse-equivalencia-marcas";
import { juntarCamposExtras, unidadeDaEtiqueta } from "@/lib/etiqueta-campos-extras";
import * as XLSX from "xlsx";
import zlib from "zlib";

// MODELO QWS/PETROBRAS — a etiqueta com os campos que só este cliente pede.
//
// ⚠ Mesma pergunta do teste do modelo padrão, e pelo mesmo motivo: pixel não prova geometria. O que
// se verifica aqui é numérico — o texto termina antes da moldura, a grade cabe no rolo — mais o
// caminho do dado da planilha até a peça.

/**
 * O texto desenhado no PDF, para conferir CONTEÚDO e não só geometria.
 *
 * ⚠ Os fluxos de página saem COMPRIMIDOS (FlateDecode) — procurar a TAG nos bytes crus devolve
 * vazio e o teste passaria dizendo nada. Aqui cada fluxo é inflado antes de procurar os `(trecho) Tj`
 * que o pdf-lib escreve por `drawText`; ele quebra a frase em vários trechos ao ajustar espaçamento,
 * então os trechos são juntados na ordem.
 */
function textoDoPdf(bytes) {
  const bruto = Buffer.from(bytes);
  const partes = [];
  let i = 0;
  while ((i = bruto.indexOf("stream", i)) !== -1) {
    let ini = i + 6;
    if (bruto[ini] === 0x0d) ini++;
    if (bruto[ini] === 0x0a) ini++;
    const fim = bruto.indexOf("endstream", ini);
    if (fim === -1) break;
    try { partes.push(zlib.inflateSync(bruto.subarray(ini, fim)).toString("latin1")); }
    catch { /* fluxo que não é Flate (imagem do QR, fonte): não interessa aqui */ }
    i = fim + 9;
  }
  // ⚠ O pdf-lib escreve o texto como STRING HEXADECIMAL (`<4142…> Tj`), não entre parênteses.
  // Procurar `(texto) Tj` devolvia vazio — e o teste passaria dizendo nada.
  return (partes.join("").match(/<([0-9A-Fa-f]+)>\s*Tj/g) || [])
    .map((m) => Buffer.from(m.replace(/[^0-9A-Fa-f]/g, ""), "hex").toString("latin1"))
    .join("");
}

async function fontes() {
  const pdf = await PDFDocument.create();
  return { bold: await pdf.embedFont(StandardFonts.HelveticaBold) };
}

const TAG_LONGA = "PA-20A-AR1315-001/SE-OS-20A-AG268-002";   // a mais comprida da OP-102
const REF_LONGA = "DE-REPLAN-200A-23-00435-0082";
const PECA = {
  marca: "T102A1", descricao: "L2''X1/4''", qte: 1, pesoUnitKg: 13.26,
  unidadesQws: [{ unidade: 1, descricao: "SE-001", referencia: '2"-HC-20A-2371-Cc-NI', tagPetrobras: "PS-20A-V1419338-001" }],
};

/** A T102A15 de verdade: 3 peças, 3 TAGs. */
const PECA_TRES = {
  marca: "T102A15", descricao: "L2''X1/4''", qte: 3, pesoUnitKg: 11.34,
  unidadesQws: [
    { unidade: 1, descricao: "SE-030", referencia: "DE-REPLAN-200A-23-00435-0040", tagPetrobras: "PS-20A-HC725-001" },
    { unidade: 2, descricao: "SE-030", referencia: "DE-REPLAN-200A-23-00435-0040", tagPetrobras: "PS-20A-HC725-002" },
    { unidade: 3, descricao: "SE-030", referencia: "DE-REPLAN-200A-23-00435-0040", tagPetrobras: "PS-20A-HC726-001" },
  ],
};

describe("a grade do modelo QWS cabe na etiqueta de 100×50", () => {
  it("nada da grade passa dos limites do rolo", () => {
    expect(GRADE_QWS.fimDir).toBeLessThan(100);
    expect(GRADE_QWS.fim).toBeLessThan(50);
    expect(GRADE_QWS.colRodape).toBeLessThan(GRADE_QWS.colQR);
    expect(GRADE_QWS.colQR).toBeLessThan(GRADE_QWS.fimDir);
    expect(GRADE_QWS.colOP).toBeLessThan(GRADE_QWS.fimDir);
  });

  it("as linhas horizontais estão em ordem, de cima para baixo", () => {
    const g = GRADE_QWS;
    const ordem = [g.borda, g.yCabecalho, g.yCliente, g.yTagRotulo, g.yTag, g.fim];
    expect(ordem).toEqual([...ordem].sort((a, b) => a - b));
  });

  // ⚠⚠ O QR ENCOSTAVA NA LEGENDA — visto no PDF renderizado, não no cálculo. A faixa precisa caber
  // o QR (borda de baixo em yCliente+0,8+lado) MAIS a linha da marca embaixo dele.
  it("a faixa da TAG cabe o QR e ainda sobra para a legenda da marca", () => {
    const baseDoQr = GRADE_QWS.yCliente + 0.8 + GRADE_QWS.qr;
    const topoDaLegenda = GRADE_QWS.yTag - 0.8 - alturaMm(5.5);
    expect(baseDoQr).toBeLessThanOrEqual(topoDaLegenda);
    expect(GRADE_QWS.yTag - 0.8).toBeLessThan(GRADE_QWS.yTag);
  });
});

/** A altura da caixa de um texto, em mm — é o que decide se duas linhas se encavalam. */
const alturaMm = (pontos) => (pontos / 72) * 25.4;

// ⚠⚠ ESTE BLOCO NASCEU DE UM DEFEITO REAL. A primeira versão punha cada linha do rodapé na metade
// da faixa e o rótulo "PESO (kg):" saiu desenhado POR CIMA do valor "13,26" — 12,8 mm não dão para
// duas linhas de rótulo+valor sem contas explícitas.
describe("o rodapé não encavala rótulo e valor", () => {
  const { rot1, val1, rot2, val2, tamValor, tamRotulo } = RODAPE;
  const altura = GRADE_QWS.fim - GRADE_QWS.yTag;

  it.each([["primeira", rot1, val1], ["segunda", rot2, val2]])(
    "na %s linha o valor começa abaixo da linha de base do rótulo", (_n, rot, val) => {
      expect(val - alturaMm(tamValor)).toBeGreaterThanOrEqual(rot);
    });

  it("o rótulo da segunda linha começa abaixo do valor da primeira", () => {
    expect(rot2 - alturaMm(tamRotulo)).toBeGreaterThanOrEqual(val1);
  });

  it("nada do rodapé passa da borda de baixo da etiqueta", () => {
    expect(val2).toBeLessThanOrEqual(altura);
  });
});

describe("as células de texto variável seguram o valor mais longo da OP-102", () => {
  it.each([
    ["TAG PETROBRAS", GRADE_QWS.borda + 1.8, GRADE_QWS.colQR - 2, 13, TAG_LONGA],
    ["marca sob o QR", GRADE_QWS.colQR + 1, GRADE_QWS.fimDir - 1, 5.5, "T102B63"],
    ["REFERÊNCIA", GRADE_QWS.colRodape + 1.8, GRADE_QWS.fimDir - 1.5, 6.5, REF_LONGA],
    ["TAG / DESCRIÇÃO", GRADE_QWS.colRodape + 1.8, GRADE_QWS.fimDir - 1.5, 6.5, "T102A16  /  SE-035 - PARTE 1"],
    ["CLIENTE/OBRA", 3, GRADE_QWS.colOP - 1.5, 8, "QWS | Revamp"],
  ])("célula %s não vaza a moldura", async (_nome, xIni, xFim, tamMax, texto) => {
    const { bold } = await fontes();
    const r = ajustarTexto(texto, bold, { xIni, xFim, tamMax });
    expect(r.xFim).toBeLessThanOrEqual(xFim);
    expect(r.xFim).toBeLessThanOrEqual(GRADE_QWS.fimDir);
  });
});

describe("gerarEtiquetasCarregamentoPDF — modelo qws", () => {
  const base = { cliente: "QWS", obra: "Revamp", opNumero: "102", modelo: "qws" };

  it("a página continua 100×50 mm — é o MESMO rolo e a MESMA impressora", async () => {
    const bytes = await gerarEtiquetasCarregamentoPDF({ ...base, pecas: [PECA] });
    const { width, height } = (await PDFDocument.load(bytes)).getPage(0).getSize();
    expect(width / MM).toBeCloseTo(100, 5);
    expect(height / MM).toBeCloseTo(50, 5);
  });

  // ⚠⚠ 10/09/2026: a primeira impressão de verdade na Argox saiu DEITADA e esticada por três
  // etiquetas do rolo. O PDF estava certo — o diálogo do Windows estava com papel "4 x 6" e escala
  // "Ajustar à área de impressão", e o Chrome girou a página de 100×50 para caber num papel em pé.
  // O conserto principal é no driver, e está escrito na tela; estas duas chaves são o que o PDF
  // pode fazer pela sua parte. O teste existe para elas não sumirem numa refatoração futura.
  it("pede ao visualizador para NÃO redimensionar e escolher a mídia pelo tamanho da página", async () => {
    const bytes = await gerarEtiquetasCarregamentoPDF({ ...base, pecas: [PECA] });
    const prefs = (await PDFDocument.load(bytes)).catalog.getOrCreateViewerPreferences();
    expect(String(prefs.getPrintScaling())).toBe("None");
    expect(prefs.getPickTrayByPDFSize()).toBe(true);
  });

  it("continua uma etiqueta por PEÇA, não por marca", async () => {
    const bytes = await gerarEtiquetasCarregamentoPDF({ ...base, pecas: [{ ...PECA, qte: 4 }] });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(4);
  });

  // ⚠ PEÇA SEM OS CAMPOS DO CLIENTE AINDA IMPRIME. A planilha pode não ter sido importada, ou a
  // marca pode não estar nela — a etiqueta sai com "—" nesses campos. Recusar-se a gerar deixaria
  // o pátio parado por um dado que só o cliente pode mandar.
  it("peça sem TAG/referência não derruba a geração", async () => {
    const bytes = await gerarEtiquetasCarregamentoPDF({
      ...base, pecas: [{ marca: "T102Z9", qte: 1, pesoUnitKg: 10 }],
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it("modelo desconhecido cai no padrão em vez de estourar", async () => {
    const bytes = await gerarEtiquetasCarregamentoPDF({ ...base, modelo: "inventado", pecas: [PECA] });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  // ⚠⚠ O TESTE OLHA O TEXTO DENTRO DO PDF, não só a contagem de páginas. Era exatamente aqui que
  // a versão por marca falhava em silêncio: 3 páginas saíam, todas com a TAG da primeira unidade —
  // e o recebimento do cliente confere justamente por esse código.
  it("as 3 etiquetas da T102A15 saem cada uma com a SUA TAG", async () => {
    const bytes = await gerarEtiquetasCarregamentoPDF({ ...base, pecas: [PECA_TRES] });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(3);
    const texto = textoDoPdf(bytes);
    for (const tag of ["PS-20A-HC725-001", "PS-20A-HC725-002", "PS-20A-HC726-001"]) {
      expect(texto).toContain(tag);
    }
  });

  // ⚠ Matheus (10/09/2026): "ficou T102A1-SE-001, parece um negócio só". São dois códigos de
  // sistemas diferentes; colados por hífen viram um terceiro código, que não existe em lugar nenhum.
  it("a marca e a posição saem separadas por barra, não coladas por hífen", async () => {
    const bytes = await gerarEtiquetasCarregamentoPDF({ ...base, pecas: [PECA] });
    const texto = textoDoPdf(bytes);
    expect(texto).toContain("T102A1  /  SE-001");
    expect(texto).not.toContain("T102A1-SE-001");
    expect(texto).toContain("TAG / DESCRIÇÃO:");
    expect(texto).not.toContain("TAG FOR");
  });

  it("os dois modelos estão declarados para a rota validar", () => {
    expect(MODELOS).toContain("padrao");
    expect(MODELOS).toContain("qws");
  });
});

/** Uma planilha no formato do cliente, montada em memória — nada de arquivo de produção no teste. */
const planilha = (linhas) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), "Plan1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
};

const CABECALHO = ["MARCA", " QTD. ", " DESCRIÇÃO ", "REFERENCIA", "TAG PETROBRAS", "PESO \nUNIT. (kg)"];

describe("parseEquivalenciaMarcas", () => {
  it("lê marca, posição, referência e TAG, limpando o espaço rígido da planilha", () => {
    const r = parseEquivalenciaMarcas(planilha([
      ["LISTA EQUIVALENCIA DE MARCAS"],
      CABECALHO,
      ["T102A1", 1, "  SE-001  ", '2"-HC-20A-2371-Cc-NI', "PS-20A-V1419338-001", 13.26],
    ]));
    expect(r.unidades).toEqual([{
      marca: "T102A1", unidade: 1, descricao: "SE-001",
      referencia: '2"-HC-20A-2371-Cc-NI', tagPetrobras: "PS-20A-V1419338-001",
    }]);
    expect(r.marcas).toBe(1);
  });

  // ⚠ O TÍTULO DA PLANILHA TEM A PALAVRA "MARCAS". Procurar só por "marca" acharia a linha 1 como
  // cabeçalho e todas as colunas sairiam deslocadas a partir dali.
  it("não confunde o título com o cabeçalho", () => {
    const r = parseEquivalenciaMarcas(planilha([
      ["OP.102 - LISTA EQUIVALENCIA DE MARCAS"], [], CABECALHO,
      ["T102B1", 1, "SE-070", "REF-1", "PS-1", 5],
    ]));
    expect(r.unidades).toHaveLength(1);
    expect(r.unidades[0].tagPetrobras).toBe("PS-1");
  });

  // ⚠⚠ Matheus (10/09/2026): "quando uma marca se repetir é porque a REFERENCIA E TAG PETROBRAS são
  // diferentes para cada unidade dessa peça". As 3 linhas da T102A15 são 3 peças, cada uma com a sua
  // TAG — guardar só uma faria as 3 etiquetas saírem com o código da primeira.
  it("marca repetida vira uma unidade numerada por linha, cada uma com a sua TAG", () => {
    const r = parseEquivalenciaMarcas(planilha([
      CABECALHO,
      ["T102A15", 1, "SE-030", "REF", "PS-20A-HC725-001", 11.34],
      ["T102A15", 1, "SE-030", "REF", "PS-20A-HC725-002", 11.34],
      ["T102A15", 1, "SE-030", "REF", "PS-20A-HC726-001", 11.34],
    ]));
    expect(r.marcas).toBe(1);
    expect(r.unidades.map((u) => [u.unidade, u.tagPetrobras])).toEqual([
      [1, "PS-20A-HC725-001"], [2, "PS-20A-HC725-002"], [3, "PS-20A-HC726-001"],
    ]);
  });

  it("descarta rodapé e linha sem marca, e diz quantas descartou", () => {
    const r = parseEquivalenciaMarcas(planilha([
      CABECALHO,
      ["T102A1", 1, "SE-001", "REF", "PS-1", 1],
      [null, null, null, null, null, null],
      ["TOTAL.:", 80, null, null, null, 8705],
    ]));
    expect(r.unidades.map((m) => m.marca)).toEqual(["T102A1"]);
    // ⚠ 1, não 2: a linha toda vazia nem chega aqui — o `blankrows: false` da leitura já a descarta.
    // `ignoradas` conta o que TINHA conteúdo e mesmo assim não virou marca, que é o rodapé "TOTAL.:".
    expect(r.ignoradas).toBe(1);
  });

  it("recusa planilha sem o cabeçalho esperado em vez de importar lixo", () => {
    expect(() => parseEquivalenciaMarcas(planilha([["A", "B"], [1, 2]]))).toThrow(/cabeçalho/i);
  });
});

describe("juntarCamposExtras e unidadeDaEtiqueta", () => {
  const extras = new Map([["T102A1", [{ unidade: 1, descricao: "SE-001", referencia: "REF", tagPetrobras: "PS-1" }]]]);

  // ⚠⚠ A PEÇA JÁ TEM UMA `descricao` — o PERFIL. A posição do cliente mora dentro da unidade;
  // achatar aqui trocaria o que o modelo padrão imprime, em silêncio.
  it("não sobrescreve a descrição (perfil) da peça", () => {
    const [p] = juntarCamposExtras([{ marca: "T102A1", descricao: "L2''X1/4''" }], extras);
    expect(p.descricao).toBe("L2''X1/4''");
    expect(unidadeDaEtiqueta(p, 1).descricao).toBe("SE-001");
    expect(unidadeDaEtiqueta(p, 1).tagPetrobras).toBe("PS-1");
  });

  it("casa a marca ignorando caixa e espaço em volta", () => {
    const [p] = juntarCamposExtras([{ marca: " t102a1 " }], extras);
    expect(unidadeDaEtiqueta(p, 1).tagPetrobras).toBe("PS-1");
  });

  it("marca sem campos importados passa intacta", () => {
    const [p] = juntarCamposExtras([{ marca: "T102Z9", descricao: "W200" }], extras);
    expect(p).toEqual({ marca: "T102Z9", descricao: "W200" });
    expect(unidadeDaEtiqueta(p, 1)).toEqual({});
  });

  it("cada etiqueta pega a SUA unidade", () => {
    expect(unidadeDaEtiqueta(PECA_TRES, 1).tagPetrobras).toBe("PS-20A-HC725-001");
    expect(unidadeDaEtiqueta(PECA_TRES, 2).tagPetrobras).toBe("PS-20A-HC725-002");
    expect(unidadeDaEtiqueta(PECA_TRES, 3).tagPetrobras).toBe("PS-20A-HC726-001");
  });

  // ⚠ Cadastro com mais peças que a planilha do cliente (revisões diferentes): a etiqueta sobrando
  // cai na primeira unidade. Em branco, o pátio só descobriria na hora de colar.
  it("etiqueta além das unidades importadas cai na primeira, não em branco", () => {
    expect(unidadeDaEtiqueta(PECA_TRES, 4).tagPetrobras).toBe("PS-20A-HC725-001");
  });
});
