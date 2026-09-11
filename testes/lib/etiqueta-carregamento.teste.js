import { describe, it, expect } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import zlib from "zlib";
import { emMilimetros, LIMITE_MM } from "@/lib/etiqueta-calibragem";
import { desenharEndereco } from "@/lib/etiqueta-pdf-base";
import { gerarEtiquetasCarregamentoPDF, ajustarTexto, numeroDaEtiqueta, contagemDaEtiqueta, transformeDaCalibragem, GRADE, MM } from "@/lib/etiqueta-carregamento-pdf";

// ⚠ POR QUE ESTE TESTE EXISTE, E NÃO UMA OLHADA NA TELA.
//
// A etiqueta é desenhada por coordenada. Conferi a primeira versão renderizando o PDF e olhando:
// "parece que a marca longa vaza a célula". Não vazava — o visualizador dava zoom diferente quando
// o PDF tinha uma página só. Perdi tempo consertando o que não estava quebrado, e o que ESTAVA
// (a marca sob o QR, essa sim sem ajuste nenhum) não aparecia no olho.
//
// Pixel não prova geometria. Aqui a pergunta é numérica: o texto termina antes da moldura?

/**
 * O texto desenhado no PDF — para conferir CONTEÚDO, não só geometria.
 *
 * ⚠ Os fluxos saem COMPRIMIDOS (FlateDecode) e o pdf-lib escreve o texto como string HEXADECIMAL
 * (`<4142…> Tj`), não entre parênteses. Procurar nos bytes crus, ou por `(texto) Tj`, devolve vazio
 * — e o teste passaria dizendo nada. Mesma função do teste do modelo QWS.
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
    catch { /* fluxo que não é Flate (QR, fonte) */ }
    i = fim + 9;
  }
  return (partes.join("").match(/<([0-9A-Fa-f]+)>\s*Tj/g) || [])
    .map((m) => Buffer.from(m.replace(/[^0-9A-Fa-f]/g, ""), "hex").toString("latin1"))
    .join("");
}

async function fontes() {
  const pdf = await PDFDocument.create();
  return { bold: await pdf.embedFont(StandardFonts.HelveticaBold) };
}

const MARCA_LONGA = "T89-CONJUNTO-LONGO-999-XYZ";
const DESC_LONGA = "COLUNA COM CHAPA DE BASE, ENRIJECEDORES E CHUMBADORES";

describe("ajustarTexto — nada pode vazar a célula", () => {
  it("encolhe até caber e devolve onde o texto termina", async () => {
    const { bold } = await fontes();
    const r = ajustarTexto(MARCA_LONGA, bold, { xIni: 38, xFim: 97.3, tamMax: 15 });
    expect(r.tam).toBeLessThan(15);
    expect(r.xFim).toBeLessThanOrEqual(97.3);
  });

  it("texto curto fica no tamanho máximo — encolher sem precisar seria pior de ler", async () => {
    const { bold } = await fontes();
    expect(ajustarTexto("T89C20", bold, { xIni: 38, xFim: 97.3, tamMax: 15 }).tam).toBe(15);
  });

  it("quando encolher não basta, corta com reticência em vez de vazar", async () => {
    const { bold } = await fontes();
    const r = ajustarTexto("X".repeat(400), bold, { xIni: 38, xFim: 97.3, tamMax: 15, tamMin: 4 });
    expect(r.tam).toBe(4);
    expect(r.texto.endsWith("…")).toBe(true);
    expect(r.xFim).toBeLessThanOrEqual(97.3);
  });

  it("string vazia não quebra", async () => {
    const { bold } = await fontes();
    expect(ajustarTexto("", bold, { xIni: 38, xFim: 97.3, tamMax: 15 }).tam).toBe(15);
  });

  // As três células de texto variável, medidas com os MESMOS limites que o desenho usa.
  it.each([
    ["TAG", GRADE.colQtde + 11, GRADE.fimDir - 1.5, 15, MARCA_LONGA],
    ["marca sob o QR", GRADE.colDir + 1, GRADE.fimDir - 1, 6, MARCA_LONGA],
    ["DESCRIÇÃO", GRADE.colQtde + 1.5, GRADE.fimDir - 1.5, 8, DESC_LONGA],
  ])("célula %s segura o texto longo dentro da moldura", async (_nome, xIni, xFim, tamMax, texto) => {
    const { bold } = await fontes();
    const r = ajustarTexto(texto, bold, { xIni, xFim, tamMax });
    expect(r.xFim).toBeLessThanOrEqual(xFim);
    expect(r.xFim).toBeLessThanOrEqual(GRADE.fimDir);
  });
});

describe("numeroDaEtiqueta — o T é convenção da etiqueta, não do banco", () => {
  it.each([
    ["121", "T121"],
    ["089", "T089"],
    ["036-01", "T036-01"],
    ["T89", "T89"],      // já veio com T: não dobra
    ["t89", "T89"],      // minúsculo do cadastro vira maiúsculo
  ])("%s vira %s", (entrada, esperado) => {
    expect(numeroDaEtiqueta(entrada)).toBe(esperado);
  });

  it("vazio não vira um T sozinho", () => {
    expect(numeroDaEtiqueta("")).toBe("—");
    expect(numeroDaEtiqueta(null)).toBe("—");
  });
});

describe("contagemDaEtiqueta — sem zero à esquerda", () => {
  // ⚠ Matheus (08/09/2026): "remova esses 0 à esquerda". O "001/1" era exigência do BarTender,
  // que importava a planilha com o campo de largura fixa.
  it.each([
    [1, 1, "1/1"],
    [3, 3, "3/3"],
    [7, 12, "7/12"],
    [300, 300, "300/300"],
    [1, 1000, "1/1000"],
  ])("%s de %s vira %s", (i, n, esperado) => {
    expect(contagemDaEtiqueta(i, n)).toBe(esperado);
  });

  it("nenhum resultado começa com zero", () => {
    for (let i = 1; i <= 20; i++) expect(contagemDaEtiqueta(i, 20).startsWith("0")).toBe(false);
  });
});

describe("a grade cabe na etiqueta de 100×50", () => {
  it("nada da grade passa dos limites do rolo", () => {
    expect(GRADE.fimDir).toBeLessThan(100);
    expect(GRADE.fim).toBeLessThan(50);
    expect(GRADE.colQtde).toBeLessThan(GRADE.colDir);
    expect(GRADE.colDir).toBeLessThan(GRADE.fimDir);
  });

  it("as linhas horizontais estão em ordem, de cima para baixo", () => {
    const ordem = [GRADE.borda, GRADE.yOP, GRADE.yCabecalho, GRADE.yCliente, GRADE.yObra, GRADE.yTag, GRADE.fim];
    expect(ordem).toEqual([...ordem].sort((a, b) => a - b));
  });
});

describe("gerarEtiquetasCarregamentoPDF", () => {
  const base = { cliente: "TMSA", obra: "TPR763 - TERMASA - EL - 303", opNumero: "T89" };

  it("a página tem exatamente 100×50 mm — é o rolo que está na máquina", async () => {
    const bytes = await gerarEtiquetasCarregamentoPDF({
      ...base, pecas: [{ marca: "T89C20", descricao: "Treliça", qte: 1, pesoUnitKg: 94.65 }],
    });
    const pdf = await PDFDocument.load(bytes);
    const { width, height } = pdf.getPage(0).getSize();
    expect(width / MM).toBeCloseTo(100, 5);
    expect(height / MM).toBeCloseTo(50, 5);
  });

  // ⚠ UMA ETIQUETA POR PEÇA, não por marca. É o "001/1" da etiqueta em uso: quem confere o
  // carregamento precisa saber se falta uma das cinco.
  it("uma marca com 5 peças gera 5 etiquetas", async () => {
    const bytes = await gerarEtiquetasCarregamentoPDF({
      ...base, pecas: [{ marca: "T89C21", descricao: "Viga", qte: 5, pesoUnitKg: 12 }],
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(5);
  });

  it("soma as quantidades de várias marcas", async () => {
    const bytes = await gerarEtiquetasCarregamentoPDF({
      ...base,
      pecas: [{ marca: "A", qte: 2 }, { marca: "B", qte: 3 }, { marca: "C", qte: 1 }],
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(6);
  });

  it("quantidade ausente ou zerada ainda rende uma etiqueta", async () => {
    const bytes = await gerarEtiquetasCarregamentoPDF({
      ...base, pecas: [{ marca: "SEM-QTE" }, { marca: "ZERO", qte: 0 }],
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
  });

  it("aguenta acento, obra vazia e peso nulo sem explodir", async () => {
    const bytes = await gerarEtiquetasCarregamentoPDF({
      cliente: "AÇOS SÃO JOÃO", obra: null, opNumero: "T90",
      pecas: [{ marca: "T90C1", descricao: "Treliça de cobertura", qte: 1, pesoUnitKg: null }],
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
});

// ⚠⚠ A TAG DA OBRA — Matheus (11/09/2026): "inserir uma TAG manualmente que se repita em TODAS as
// etiquetas na frente do nome da OBRA, exemplo na OP 103 preciso colocar a tag TPR00870".
//
// "Em todas" é o requisito, e é o que mais fácil quebraria numa refatoração: bastaria a tag ser
// lida uma vez fora do laço das peças para sair só na primeira.
describe("TAG da obra no modelo padrão", () => {
  const base = { cliente: "TMSA", obra: "Torocua", opNumero: "103" };

  it("sai DEPOIS do nome da obra, separada por | e não por hífen", async () => {
    const bytes = await gerarEtiquetasCarregamentoPDF({
      ...base, tagObra: "TPR00870", pecas: [{ marca: "M1", qte: 1 }],
    });
    const texto = textoDoPdf(bytes);
    expect(texto).toContain("Torocua | TPR00870");
    expect(texto).not.toContain("Torocua-TPR00870");
  });

  it("repete em TODAS as etiquetas, não só na primeira", async () => {
    const bytes = await gerarEtiquetasCarregamentoPDF({
      ...base, tagObra: "TPR00870", pecas: [{ marca: "M1", qte: 3 }, { marca: "M2", qte: 2 }],
    });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(5);
    const texto = textoDoPdf(bytes);
    expect(texto.split("TPR00870").length - 1).toBe(5);
  });

  it("sem TAG a obra sai sozinha, sem separador solto", async () => {
    const texto = textoDoPdf(await gerarEtiquetasCarregamentoPDF({ ...base, pecas: [{ marca: "M1", qte: 1 }] }));
    expect(texto).toContain("Torocua");
    expect(texto).not.toContain("Torocua |");
  });

  // ⚠ O QWS IGNORA A TAG. A célula de cima dele já é "cliente | obra" e a peça é identificada pela
  // TAG Petrobras — mais um código ali brigaria por espaço com o que o cliente confere.
  it("o modelo QWS não recebe a TAG mesmo se ela vier", async () => {
    const texto = textoDoPdf(await gerarEtiquetasCarregamentoPDF({
      ...base, modelo: "qws", tagObra: "TPR00870", pecas: [{ marca: "M1", qte: 1 }],
    }));
    expect(texto).not.toContain("TPR00870");
  });

  // ⚠⚠ ESTE É O TESTE QUE JUSTIFICA TER TROCADO `p.campo` POR `encaixar` NA OBRA. Antes o valor era
  // escrito CRU: obra comprida já corria por cima da coluna do QR, e a TAG na frente garante isso.
  // O corte com reticência é feio e visível; texto invadindo a célula vizinha é feio e silencioso.
  it("obra comprida COM tag é encaixada em vez de vazar a célula", async () => {
    const { bold } = await fontes();
    const longa = "TMSA — Torocua - Ñacunday - Bloco Norte | TPR00870";
    const r = ajustarTexto(longa, bold, { xIni: 4.5, xFim: GRADE.colDir - 1.5, tamMax: 8 });
    expect(r.xFim).toBeLessThanOrEqual(GRADE.colDir - 1.5);
    expect(r.tam).toBeLessThan(8);
  });
});

// ⚠⚠ A CALIBRAGEM DA IMPRESSORA. Matheus (11/09/2026): "minha etiqueta ainda está saindo bem para
// esquerda a impressão aí fica cortando, como eu consigo centralizar ela mais para direita".
//
// Duas coisas precisam ficar provadas, e a segunda foi um erro real da primeira tentativa:
//   1. deslocar SOZINHO não serve — o desenho já usa 1,2–98,8 de 100 mm, então tem que encolher;
//   2. `scaleContent` ancora no canto de BAIXO: descer ingenuamente joga o rodapé para fora.
describe("calibragem da impressora", () => {
  const cantos = (t) => ({
    esq: t.tx, dir: t.tx + 100 * t.escala,
    topo: 50 - (t.ty + 50 * t.escala), base: 50 - t.ty,
  });

  it("sem deslocamento não transforma nada — o desenho já é centrado", () => {
    expect(transformeDaCalibragem({})).toBeNull();
    expect(transformeDaCalibragem({ deslocX: 0, deslocY: 0 })).toBeNull();
  });

  it("deslocar para a direita encolhe o bastante para o QR não sair pelo outro lado", () => {
    const t = transformeDaCalibragem({ deslocX: 5 });
    expect(t.escala).toBeCloseTo(0.95, 5);
    const c = cantos(t);
    expect(c.esq).toBeCloseTo(5, 5);
    expect(c.dir).toBeLessThanOrEqual(100 + 1e-9);
  });

  // ⚠ O caso que a primeira versão errou: a moldura de baixo saía da página.
  it("deslocar para baixo não empurra o rodapé para fora", () => {
    const c = cantos(transformeDaCalibragem({ deslocY: 2 }));
    expect(c.topo).toBeCloseTo(2, 5);
    expect(c.base).toBeLessThanOrEqual(50 + 1e-9);
  });

  it.each([[6, 2], [-4, -1.5], [10, 10], [3, 0], [0, 3]])(
    "desloc %s,%s mantém o desenho inteiro dentro da etiqueta", (deslocX, deslocY) => {
      const c = cantos(transformeDaCalibragem({ deslocX, deslocY }));
      expect(c.esq).toBeGreaterThanOrEqual(-1e-9);
      expect(c.dir).toBeLessThanOrEqual(100 + 1e-9);
      expect(c.topo).toBeGreaterThanOrEqual(-1e-9);
      expect(c.base).toBeLessThanOrEqual(50 + 1e-9);
    });

  it("a página continua 100×50 mm — a calibragem move o conteúdo, não o papel", async () => {
    const bytes = await gerarEtiquetasCarregamentoPDF({
      cliente: "TMSA", obra: "Torocua", opNumero: "103",
      pecas: [{ marca: "M1", qte: 2 }], calibragem: { deslocX: 4, deslocY: 1 },
    });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(2);
    const { width, height } = pdf.getPage(0).getSize();
    expect(width / MM).toBeCloseTo(100, 5);
    expect(height / MM).toBeCloseTo(50, 5);
  });
});

// ⚠ A ENTRADA VEM DE UM CAMPO DE TEXTO, e o que chega nem sempre é número. Vírgula é o separador
// decimal de quem digita aqui; valor absurdo é quase certamente erro de digitação, e uma etiqueta
// encolhida a 40% seria um segundo problema em cima do primeiro.
describe("emMilimetros — o que a calibragem aceita", () => {
  it("aceita vírgula como separador decimal", () => {
    expect(emMilimetros("1,5")).toBe(1.5);
    expect(emMilimetros("-2,5")).toBe(-2.5);
  });

  it("limita ao que o papel aguenta, nos dois sentidos", () => {
    expect(emMilimetros(40)).toBe(LIMITE_MM);
    expect(emMilimetros(-40)).toBe(-LIMITE_MM);
  });

  it("texto e vazio viram zero — sem calibragem, não um NaN que arrasta para o PDF", () => {
    for (const lixo of ["", null, undefined, "abc", {}]) expect(emMilimetros(lixo)).toBe(0);
  });
});

// ⚠⚠ UMA ETIQUETA PARA A CAIXA. Matheus (11/09/2026): "pode ocorrer casos de uma marca ter 50 peças
// mas são todas pequenas, aí montamos uma caixa com as 50 peças e colamos somente 1 etiqueta 50/50;
// se não tiver essa opção o portal vai imprimir as 50 etiquetas".
describe("marca fechada numa caixa", () => {
  const base = { cliente: "TMSA", obra: "Torocua", opNumero: "103" };

  it("50 peças em caixa rendem UMA etiqueta, não 50", async () => {
    const bytes = await gerarEtiquetasCarregamentoPDF({
      ...base, pecas: [{ marca: "M1", qte: 50, emCaixa: true }],
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  // ⚠ A etiqueta única diz "50/50" — o volume é um só e carrega o lote inteiro. Dissesse "1/50",
  // quem confere o carregamento procuraria outras 49 caixas que não existem.
  it("a etiqueta da caixa diz N/N, não 1/N", async () => {
    const texto = textoDoPdf(await gerarEtiquetasCarregamentoPDF({
      ...base, pecas: [{ marca: "M1", qte: 50, emCaixa: true }],
    }));
    expect(texto).toContain("50/50");
    expect(texto).not.toContain("1/50");
  });

  it("sem a marcação continua uma etiqueta por peça", async () => {
    const bytes = await gerarEtiquetasCarregamentoPDF({ ...base, pecas: [{ marca: "M1", qte: 50 }] });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(50);
  });

  it("convive com marcas normais no mesmo lote", async () => {
    const bytes = await gerarEtiquetasCarregamentoPDF({
      ...base, pecas: [{ marca: "M1", qte: 50, emCaixa: true }, { marca: "M2", qte: 3 }],
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(4);
  });
});

// ⚠⚠ O ENDEREÇO BORRAVA NA IMPRESSORA A 3,5 pt. Matheus (11/09/2026): "deixe maior também o endereço
// da Torg e telefone, está saindo todo borrado por conta do tamanho". A 203 dpi, 3,5 pt tem ~10
// pontos de altura — na térmica isso vira mancha, não letra.
//
// O que precisa ficar provado: o corpo CRESCE até o limite do espaço, e nunca passa por cima do logo.
describe("endereço da Torg no cabeçalho", () => {
  /** Um pincel de mentira: só mede e anota onde cada linha foi desenhada. */
  const pincelFalso = async () => {
    const { bold } = await fontes();
    const escritas = [];
    return {
      escritas,
      larg: (s, tam) => bold.widthOfTextAtSize(String(s), tam) / MM,
      txt: (s, mmX, mmY, tam) => escritas.push({ s, mmX, mmY, tam }),
    };
  };

  it("cresce bem acima dos 3,5 pt que borravam", async () => {
    const p = await pincelFalso();
    const tam = desenharEndereco(p, { xMin: 42, xFim: 73, yIni: 4.6, entreLinhas: 3.5 });
    expect(tam).toBeGreaterThan(3.5);
  });

  // ⚠ O logo tem tamanho MEDIDO contra a etiqueta em uso (37 mm) e não pode ser invadido. É por isso
  // que o corpo é calculado em vez de fixo: um número fixo cresceria por cima dele sem avisar.
  it("nenhuma linha começa antes do fim do logo", async () => {
    const p = await pincelFalso();
    const xMin = 42;
    desenharEndereco(p, { xMin, xFim: 73, yIni: 4.6, entreLinhas: 3.5 });
    expect(p.escritas).toHaveLength(3);
    for (const e of p.escritas) expect(e.mmX).toBeGreaterThanOrEqual(xMin - 0.001);
  });

  it("todas as linhas terminam exatamente na borda direita da célula", async () => {
    const p = await pincelFalso();
    const xFim = 73;
    desenharEndereco(p, { xMin: 42, xFim, yIni: 4.6, entreLinhas: 3.5 });
    for (const e of p.escritas) expect(e.mmX + p.larg(e.s, e.tam)).toBeLessThanOrEqual(xFim + 0.001);
  });

  // ⚠ No QWS caberiam 9 pt — o endereço ficaria do tamanho da TAG PETROBRAS, que é o que o cliente
  // lê de longe. O teto é hierarquia, não falta de espaço.
  it("com muito espaço sobrando, para no teto em vez de competir com a TAG", async () => {
    const p = await pincelFalso();
    expect(desenharEndereco(p, { xMin: 36, xFim: 97.3, yIni: 4.2, entreLinhas: 3.2 })).toBeLessThanOrEqual(5.5);
  });
});
