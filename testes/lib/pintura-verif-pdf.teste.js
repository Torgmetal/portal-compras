// O RELATÓRIO DE PINTURA (RIP) NOS LIMITES — gerado e LIDO DE VOLTA, texto e posição.
//
// Verificação dos modelos (02/10/2026), com prova em PDF: média de rugosidade "26.6 µm" com leituras 62 e
// 71; resultado REPROVADO e o PDF marcando "Aprovado"; observação cortada na 2ª linha, riscada pela
// borda; ST3/SA1/SA2 sem caixa nenhuma; REC e espessura mínima um por cima do outro; a validade da 3ª e
// 4ª lata sumindo em "..."; a condição do jato saindo na coluna da demão como medição; a folha 1 saindo
// do papel com peças em 3 linhas, 9 instrumentos e assinatura com imagem; datas em ISO e média com ponto.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PDFPage } from "pdf-lib";
import { getDocumentProxy } from "unpdf";
import { gerarPDFdoRelatorio } from "@/lib/relatorio-render";

/**
 * Cada pedaço de texto do PDF com folha, posição e largura (y a partir do pé da folha).
 * ⚠ o leitor devolve o "µ" (sinal de micro, o que a fonte escreve) normalizado para o "μ" grego — volta aqui.
 */
async function lerPDF(bytes) {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const itens = [], paginas = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const pg = await pdf.getPage(p);
    const { height } = pg.getViewport({ scale: 1 });
    const { items } = await pg.getTextContent();
    const str = (it) => it.str.replace(/μ/g, "µ");
    for (const it of items) if (it.str.trim()) itens.push({ pagina: p, str: str(it), x: it.transform[4], y: it.transform[5], w: it.width, altura: height });
    paginas.push(items.map(str).join(" ").replace(/\s+/g, " "));
  }
  return { itens, paginas, todo: paginas.join(" ") };
}

function dentroDoPapel(itens) {
  for (const it of itens) {
    expect(it.y, `"${it.str}" na folha ${it.pagina}`).toBeGreaterThanOrEqual(28);
    expect(it.y, `"${it.str}" na folha ${it.pagina}`).toBeLessThanOrEqual(it.altura - 28);
  }
}

// assinatura com imagem cadastrada: o bloco sobe de 54 para 118 pt (a imagem em si não precisa baixar)
beforeEach(() => vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("sem rede no teste"); })));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const palavras = (n, p) => Array.from({ length: n }, (_, i) => `${p}${String(i + 1).padStart(3, "0")}`).join(" ");
const MARCAS = Array.from({ length: 40 }, (_, i) => (i < 32 ? `T103A${i + 1}` : `T103B${i - 31}`));
const INSTRUMENTOS_9 = Array.from({ length: 9 }, (_, i) => ({ id: `e${i}`, nome: `Instrumento de medição número ${i + 1}`, certificado: `CAL-2026/07${String(i).padStart(2, "0")}` }));
const ASSINATURAS = [
  { nome: "Alexandre Stival", setor: "Inspetor", assinadoEm: new Date("2026-10-01T15:20:00Z"), imagemUrl: "https://exemplo.invalid/a.png" },
  { nome: "Geraldo Tank", setor: "Torg Metal", assinadoEm: new Date("2026-10-01T18:05:00Z"), imagemUrl: "https://exemplo.invalid/b.png" },
  { nome: "Davi Rocha", setor: "Cliente", assinadoEm: null, imagemUrl: null },
];
const LOTES_A = "8912-1 · 8912-4 · 8930-2 · 8931-7";
const VALIDADES_A = "2027-03-15 · 2027-03-16 · 2027-05-02 · 2027-05-03";
const CABECALHO = { cliente: "TMSA Tecnologia em Movimentação S.A.", obra: "Terminal de grãos Torocuá – Ñacunday · pipe-rack PR-03", refCliente: "TPR00870" };

function relPintura(extra = {}) {
  const base = {
    tipo: "PINTURA", codigo: "RIP-103-007", revisao: 1, emitidoEm: new Date("2026-10-01T12:00:00Z"),
    opNumero: "103", marcas: ["T103A1", "T103A2"], inspetor: "Alexandre Stival", resultadoInspecao: "APROVADO",
    observacoes: "Sem observações.", equipamentos: INSTRUMENTOS_9.slice(0, 4),
    resultados: {
      descricao: "Estrutura do pipe-rack PR-03", procedimento: "PO-05 Rev.3",
      prepProcedimento: "Jateamento abrasivo", prepData: "2026-09-29", prepIni: "07:30", prepFim: "11:45",
      prepUmidade: "62", prepTAmb: "24", prepTSup: "27", prepOrvalho: "16.4", tempo: "Bom",
      rugEspec: "50 a 90 µm", rugLeituras: [62, 71, 68, 75, 66], abrasivo: "Granalha de aço G40",
      intemperismo: "B", limpeza: "SA2.5",
      demaos: {
        1: { produto: "WEGPOXI WET SURFACE 89", fabricante: "WEG Tintas", cor: "Cinza N6,5", loteA: LOTES_A, valA: VALIDADES_A,
          loteB: "8913-1", valB: "2027-03-15", loteD: "D-5521", valD: "2028-01-10", data: "2026-09-29", hIni: "13:10", hFim: "16:40",
          umidade: "58", tAmb: "26", tSup: "29", orvalho: "17", metodo: "Airless", visual: "Conforme", aderencia: "4A" },
        2: { produto: "WEGPOXI ERL 1050", fabricante: "WEG Tintas", cor: "Cinza N6,5", data: "2026-09-30", hIni: "08:05", hFim: "11:30",
          umidade: "71", tAmb: "21", tSup: "23", orvalho: "15.6", metodo: "Airless", visual: "Conforme" },
        3: { produto: "WEGTHANE HPA 2.0", fabricante: "WEG Tintas", cor: "Azul", data: "2026-10-01", hIni: "09:00", hFim: "12:15", metodo: "Airless", visual: "Conforme" },
      },
      espessuras: { 1: [92, 88, 101, 95, 90], 2: [190, 205, 198, 187, 210], 3: [262, 275, 281, 258, 270] },
      espessuraMinima: "240",
    },
  };
  return { ...base, ...extra, resultados: { ...base.resultados, ...(extra.resultados || {}) } };
}
const gerar = async (rel, mais = {}) => lerPDF(await gerarPDFdoRelatorio({ rel, ...CABECALHO, ...mais }));

describe("achado 1 — leitura em branco não entra como zero na média", () => {
  it("2 de 5 leituras de rugosidade e 3 de 5 na 3ª demão: as médias certas, com vírgula", async () => {
    const { todo } = await gerar(relPintura({ resultados: {
      rugLeituras: [62, 71, null, null, null],
      espessuras: { 1: [92, 88, 101, 95, 90], 2: [190, 205, 198, 187, 210], 3: [262, 275, 281, null, null] },
    } }));
    expect(todo).toContain("OBTIDO (média de 2): 66,5 µm");
    expect(todo).toContain("272,7");
    expect(todo).toContain("93,2");
    expect(todo).not.toMatch(/26[.,]6/);
    expect(todo).not.toMatch(/163[.,]6/);
  });
});

describe("achado 2 — o laudo do PDF é o resultado da inspeção", () => {
  /** A fonte de cada texto desenhado: a opção marcada do laudo sai em negrito, ao lado da caixa cheia. */
  async function fontes(rel) {
    const vistos = [];
    const orig = PDFPage.prototype.drawText;
    vi.spyOn(PDFPage.prototype, "drawText").mockImplementation(function (t, o) { vistos.push({ t, fonte: o?.font?.name }); return orig.call(this, t, o); });
    await gerarPDFdoRelatorio({ rel });
    return (t) => vistos.filter((v) => v.t === t).map((v) => v.fonte);
  }

  it("resultado REPROVADO com o select antigo dizendo Aprovado: o PDF marca Reprovado", async () => {
    const fonte = await fontes(relPintura({ resultadoInspecao: "REPROVADO", resultados: { laudo: "Aprovado" } }));
    expect(fonte("Reprovado")).toEqual(["Helvetica-Bold"]);
    expect(fonte("Aprovado")).toEqual(["Helvetica"]);
  });

  it("relatório antigo, sem resultado marcado, ainda usa o laudo gravado", async () => {
    const fonte = await fontes(relPintura({ resultadoInspecao: null, resultados: { laudo: "Aprovado" } }));
    expect(fonte("Aprovado")).toEqual(["Helvetica-Bold"]);
  });
});

describe("achado 3 — observações inteiras, sem estourar a folha", () => {
  it("observação de 1000 caracteres e OBS. de 500 na folha de fotos saem inteiras e dentro do papel", async () => {
    const obs = palavras(143, "obs"); // 1000 caracteres — o teto do celular
    const obsFotos = palavras(71, "fot"); // ~500
    expect(obs.length).toBe(1000);
    const fotos = [{ url: null, evidencia: "espessura", observacao: "DFT" }];
    const { todo, itens } = await gerar(relPintura({ observacoes: obs, resultados: { obsFotos } }), { fotos, assinaturas: ASSINATURAS });
    for (let i = 1; i <= 143; i++) expect(todo).toContain(`obs${String(i).padStart(3, "0")}`);
    for (let i = 1; i <= 71; i++) expect(todo).toContain(`fot${String(i).padStart(3, "0")}`);
    dentroDoPapel(itens);
  });

  it("observação maior que a folha (o computador não tem teto) continua na seguinte e diz que continua", async () => {
    const obs = palavras(1500, "o"); // ~9000 caracteres: mais que uma folha inteira
    const { todo, paginas, itens } = await gerar(relPintura({ observacoes: obs }), { assinaturas: ASSINATURAS });
    for (let i = 1; i <= 1500; i++) expect(todo).toMatch(new RegExp(`\\bo${String(i).padStart(3, "0")}\\b`));
    expect(paginas.length).toBeGreaterThan(1);
    expect(todo).toContain("OBSERVAÇÕES (continuação)");
    paginas.forEach((t, i) => expect(t, `folha ${i + 1}`).toContain(`${i + 1} DE ${paginas.length}`));
    dentroDoPapel(itens);
  });

  it("sem foto de ensaio a OBS. do registro fotográfico não some: vai para a folha 1", async () => {
    const { todo } = await gerar(relPintura({ resultados: { obsFotos: "Fotos tiradas com o celular da inspetora no galpão 2" } }));
    expect(todo).toContain("Fotos tiradas com o celular da inspetora no galpão 2");
  });
});

describe("achado 4 — o grau de limpeza escolhido sempre aparece", () => {
  it.each([["ST3", "Outro: St 3"], ["SA1", "Outro: Sa 1"], ["SA2", "Outro: Sa 2"]])("%s sai como %s, ao lado das caixas do modelo", async (grau, texto) => {
    const { todo } = await gerar(relPintura({ resultados: { limpeza: grau } }));
    expect(todo).toContain(texto);
  });

  it("os graus que o modelo tem (SA2½, WJ2) marcam a própria caixa, sem 'Outro'", async () => {
    for (const limpeza of ["SA2.5", "WJ2"]) {
      const { todo } = await gerar(relPintura({ resultados: { limpeza } }));
      expect(todo, limpeza).not.toContain("Outro:");
    }
  });
});

describe("achado 5 — laudo REC com espessura mínima", () => {
  it("o rótulo do REC e a espessura mínima não se sobrepõem — nem com o aviso do PO-05", async () => {
    const rel = relPintura({ resultadoInspecao: "REC", resultados: {
      espessuraMinima: "240",
      demaos: { ...relPintura().resultados.demaos, 2: { ...relPintura().resultados.demaos[2], umidade: "92" } },
    } });
    const { itens, todo } = await gerar(rel);
    const caixas = itens.filter((i) => /Recomendação de exame complementar|Espessura mínima especificada|Fora do PO-05|LAUDO FINAL/.test(i.str));
    expect(caixas.length).toBeGreaterThanOrEqual(4);
    for (const a of caixas) for (const b of caixas) {
      if (a === b || a.pagina !== b.pagina || Math.abs(a.y - b.y) >= 7) continue;
      expect(a.x + a.w <= b.x + 0.5 || b.x + b.w <= a.x + 0.5, `"${a.str}" × "${b.str}"`).toBe(true);
    }
    expect(todo).toContain("Espessura mínima especificada: 240 µm");
  });
});

describe("achado 6 — nada cortado com reticência", () => {
  it("4 lotes e 4 validades da lata, descrição, procedimento, pull-off e inspeção visual saem inteiros", async () => {
    const descricao = "Estrutura metálica do pipe-rack PR-03 colunas vigas e contraventamentos pintura externa sistema C3 conforme PLP R2 da obra";
    const procedimento = "PO-05 Rev.3 Preparação de Superfície e Pintura do Controle de Documentos";
    const rel = relPintura({ resultados: {
      descricao, procedimento,
      pullOffEquip: "Elcometer 510 automático com dollies de 20 mm", pullOffValor: "7.8", pullOffMin: "5",
      pullOffRuptura: "B/C 80% coesiva na primeira demão e 20% adesiva entre primeira e segunda",
      demaos: { ...relPintura().resultados.demaos, 2: { ...relPintura().resultados.demaos[2], loteA: LOTES_A, valA: VALIDADES_A,
        visual: "Escorrimento localizado em T103A12 e T103A17 corrigido com lixamento e retoque antes da terceira demão" } },
    } });
    const { todo } = await gerar(rel);
    for (const lote of LOTES_A.split(" · ")) expect(todo.split(lote).length - 1, lote).toBeGreaterThanOrEqual(2);
    for (const v of ["15/03/2027", "16/03/2027", "02/05/2027", "03/05/2027"]) expect(todo.split(v).length - 1, v).toBeGreaterThanOrEqual(2);
    const texto = [descricao, procedimento, "Elcometer 510 automático com dollies de 20 mm",
      "B/C 80% coesiva na primeira demão e 20% adesiva entre primeira e segunda",
      "Escorrimento localizado em T103A12 e T103A17 corrigido com lixamento e retoque antes da terceira demão"];
    for (const p of texto.join(" ").split(/\s+/)) expect(todo).toContain(p);
    expect(todo).not.toContain("...");
  });
});

describe("achado 6 — no teto de 300 caracteres por valor da demão", () => {
  it("a tabela de aplicação que não cabe na folha continua na seguinte, com título e demãos repetidos", async () => {
    // cada célula no teto que as duas rotas gravam (LIMITE_VALOR_DEMAO)
    const celula = (d, k) => palavras(37, `${k}${d}x`).slice(0, 300);
    const campos = ["produto", "fabricante", "cor", "loteA", "loteB", "loteD", "metodo", "visual", "aderencia"];
    const demaos = Object.fromEntries(["1", "2", "3"].map((d) => [d, Object.fromEntries(campos.map((k) => [k, celula(d, k)]))]));
    const { todo, paginas, itens } = await gerar(relPintura({ resultados: { demaos } }), { assinaturas: ASSINATURAS });
    for (const d of ["1", "2", "3"]) for (const k of campos) {
      for (const p of celula(d, k).split(" ")) expect(todo, `${k} da ${d}ª demão`).toContain(p);
    }
    const continua = paginas.findIndex((t) => t.includes("APLICAÇÃO DE TINTAS (continuação)"));
    expect(continua).toBeGreaterThan(0);
    expect(paginas[continua]).toContain("3ª DEMÃO");
    paginas.forEach((t, i) => expect(t, `folha ${i + 1}`).toContain(`${i + 1} DE ${paginas.length}`));
    dentroDoPapel(itens);
  });
});

describe("achado 7 — condição ambiental herdada do jato", () => {
  it("a demão sem leitura própria mostra a do jateamento com * e a nota diz que não foi medida nela", async () => {
    const { todo } = await gerar(relPintura());
    // a 3ª demão não tem leitura: herda 62 / 24 / 27 / 16,4 do jateamento
    for (const v of ["62*", "24*", "27*", "16,4*"]) expect(todo).toContain(v);
    expect(todo).toMatch(/condição do jateamento, não medida nesta demão/i);
    // a 1ª tem a sua: sai sem asterisco
    expect(todo).toContain("58");
    expect(todo).not.toContain("58*");
  });

  it("sem herança, nem asterisco nem nota", async () => {
    const d = relPintura().resultados.demaos;
    const { todo } = await gerar(relPintura({ resultados: { demaos: { 1: d[1], 2: d[2] } } }));
    expect(todo).not.toMatch(/não medida nesta demão/i);
    for (const v of ["58*", "71*", "62*", "24*", "27*", "16,4*"]) expect(todo).not.toContain(v);
  });
});

describe("achado 8 — a folha nunca sai do papel", () => {
  /** Toda moldura, linha e texto desenhados, para conferir contra a margem. */
  function riscos() {
    const r = [];
    const o = { t: PDFPage.prototype.drawText, re: PDFPage.prototype.drawRectangle, l: PDFPage.prototype.drawLine };
    vi.spyOn(PDFPage.prototype, "drawText").mockImplementation(function (t, op) { r.push({ o: `texto "${t}"`, y0: op.y, y1: op.y }); return o.t.call(this, t, op); });
    vi.spyOn(PDFPage.prototype, "drawRectangle").mockImplementation(function (op) { r.push({ o: "moldura", y0: op.y, y1: op.y + op.height }); return o.re.call(this, op); });
    vi.spyOn(PDFPage.prototype, "drawLine").mockImplementation(function (op) { r.push({ o: "linha", y0: Math.min(op.start.y, op.end.y), y1: Math.max(op.start.y, op.end.y) }); return o.l.call(this, op); });
    return r;
  }

  it("peças em 3 linhas, 9 instrumentos e assinatura com imagem (caso pintura-07): tudo dentro, assinatura e FOLHA x DE y em todas", async () => {
    const r = riscos();
    const doze = MARCAS.slice(0, 12);
    const rel = relPintura({ marcas: doze, equipamentos: INSTRUMENTOS_9, resultados: {
      pecasInformadas: doze.map((marca, i) => ({ marca, quantidade: (i % 4) + 1 })),
    } });
    const { paginas, itens, todo } = await gerar(rel, { assinaturas: ASSINATURAS });
    for (const x of r) {
      expect(x.y0, `${x.o} abaixo da margem`).toBeGreaterThanOrEqual(27.5);
      expect(x.y1, `${x.o} acima da margem`).toBeLessThanOrEqual(841.89 - 27.5);
    }
    dentroDoPapel(itens);
    paginas.forEach((t, i) => {
      expect(t, `folha ${i + 1}`).toContain("Inspetor de Qualidade");
      expect(t, `folha ${i + 1}`).toContain(`${i + 1} DE ${paginas.length}`);
    });
    for (const e of INSTRUMENTOS_9) expect(todo).toContain(`nº ${e.certificado}`);
    for (const m of doze) expect(todo).toMatch(new RegExp(`\\b${m} \\(`));
  });

  it("limite — 40 peças, 4 lotes, observação de 1000, 9 instrumentos, 7 fotos e assinatura com imagem", async () => {
    const r = riscos();
    const areas = ["rugosidade", "rugosidade", "salinidade", "espessura", "espessura", "pullOff", null];
    const fotos = areas.map((evidencia, i) => ({ url: null, evidencia, observacao: `Foto de teste número ${i + 1}` }));
    const rel = relPintura({ marcas: MARCAS, observacoes: palavras(143, "obs"), equipamentos: INSTRUMENTOS_9, resultados: {
      pecasInformadas: MARCAS.map((marca, i) => ({ marca, quantidade: (i % 4) + 1 })), obsFotos: palavras(71, "fot"),
    } });
    const { paginas, itens, todo } = await gerar(rel, { fotos, assinaturas: ASSINATURAS });
    for (const x of r) {
      expect(x.y0, `${x.o} abaixo da margem`).toBeGreaterThanOrEqual(27.5);
      expect(x.y1, `${x.o} acima da margem`).toBeLessThanOrEqual(841.89 - 27.5);
    }
    dentroDoPapel(itens);
    paginas.forEach((t, i) => {
      expect(t, `folha ${i + 1}`).toContain("Inspetor de Qualidade");
      expect(t, `folha ${i + 1}`).toContain(`${i + 1} DE ${paginas.length}`);
    });
    for (const m of MARCAS) expect(todo).toMatch(new RegExp(`\\b${m} \\(`));
    for (let i = 1; i <= 7; i++) expect(todo).toContain(`Foto de teste número ${i}`);
    // a folha 1 aponta a folha certa do anexo
    const folhaAnexo = paginas.findIndex((t) => t.includes("RELAÇÃO DE PEÇAS PINTADAS")) + 1;
    expect(folhaAnexo).toBeGreaterThan(1);
    expect(todo).toContain(`relação completa na folha ${folhaAnexo}`);
  });
});

describe("achado 9 — formatação do documento", () => {
  it("datas dd/mm/aaaa no preparo, na aplicação e na validade; Nº com a revisão nas folhas 2 em diante", async () => {
    const fotos = [{ url: null, evidencia: "espessura", observacao: "DFT" }];
    const { todo, paginas, itens } = await gerar(relPintura(), { fotos });
    for (const d of ["29/09/2026", "30/09/2026", "01/10/2026", "15/03/2027", "10/01/2028"]) expect(todo).toContain(d);
    expect(todo).not.toMatch(/\b20\d\d-\d\d-\d\d\b/);
    expect(paginas.length).toBeGreaterThan(1);
    // a linha "OP | CLIENTE | Nº" das folhas seguintes dizia o número SEM a revisão — o cabeçalho dizia com
    const daLinha = itens.filter((i) => i.pagina > 1 && /^RIP-103-007/.test(i.str.trim()));
    expect(daLinha.map((i) => i.str.replace(/\s+/g, " ").trim())).not.toContain("RIP-103-007");
    expect(daLinha.some((i) => i.str.trim() === "RIP-103-007 R01")).toBe(true);
  });

  it("a espessura mínima leva a unidade, e a média geral a vírgula", async () => {
    const { todo } = await gerar(relPintura());
    expect(todo).toContain("Espessura mínima especificada: 240 µm");
    expect(todo).toContain("269,2"); // (262 + 275 + 281 + 258 + 270) / 5
    expect(todo).not.toContain("269.2");
  });
});
