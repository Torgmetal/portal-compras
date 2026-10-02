// O relatório de LÍQUIDO PENETRANTE nos limites (verificação dos modelos, 02/10/2026). A tabela tinha
// altura fixa de 20 linhas e ninguém conferia o espaço antes do rodapé: com os 4 instrumentos do próprio
// modelo, a junta soldada em três linhas e a assinatura desenhada, nomes e datas saíam ABAIXO do papel —
// e o pdf.js nem devolve texto desenhado abaixo de y = 0, então a prova é o nome que some. Com mais de 20
// linhas a folha 1 saía sem assinatura, o "FOLHA x DE y" não contava as folhas de foto, a observação de
// cada linha nunca era impressa e as observações gerais sumiam depois da 3ª linha.
// Aqui cada caso é gerado e o PDF é LIDO de volta — o texto e a posição de cada pedaço dele.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getDocumentProxy } from "unpdf";
import { gerarPDFdoRelatorio } from "@/lib/relatorio-render";

/** Cada pedaço de texto do PDF com a folha e a posição (y a partir do pé da folha). */
async function lerPDF(bytes) {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const itens = [], paginas = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const pg = await pdf.getPage(p);
    const { height } = pg.getViewport({ scale: 1 });
    const { items } = await pg.getTextContent();
    for (const it of items) if (it.str.trim()) itens.push({ pagina: p, str: it.str, y: it.transform[5], altura: height });
    paginas.push(items.map((it) => it.str).join(" ").replace(/\s+/g, " "));
  }
  return { itens, paginas, todo: paginas.join(" ") };
}

// assinatura com imagem cadastrada: o bloco sobe de 54 para 118 pt (a imagem em si não precisa baixar)
beforeAll(() => vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("sem rede no teste"); })));
afterAll(() => vi.unstubAllGlobals());

const ASSINADO = [
  { setor: "inspetor", nome: "Alexandre Stival", assinadoEm: new Date("2026-10-01T12:00:00Z"), imagemUrl: "https://exemplo.invalid/a.png" },
  { setor: "torg metal", nome: "Geraldo Tank", assinadoEm: new Date("2026-10-01T13:00:00Z"), imagemUrl: "https://exemplo.invalid/g.png" },
  { setor: "cliente", nome: "Davi Fiscal", assinadoEm: new Date("2026-10-01T14:00:00Z"), imagemUrl: "https://exemplo.invalid/d.png" },
];
const NOMES = ASSINADO.map((a) => a.nome);
const instrumentos = (n) => Array.from({ length: n }, (_, i) => ({ id: `e${i}`, nome: `Instrumento calibrado ${i + 1}`, codigo: `XX ${i}`, certificado: `00-${1000 + i}/25` }));
const juntaTripla = {
  eps: "EPS 001/2025, EPS 002/2025, EPS 004/2025", rqs: "RQPS 001/2025, RQPS 002/2025, RQPS 004/2025",
  processoSolda: "GMAW, FCAW, SMAW", metalAdicao: "ER70S-6, E71T-1C, E7018", metalBase: "ASTM A572 Gr.50 / 19 mm",
};
const linhasLP = (n) => Array.from({ length: n }, (_, i) => ({
  marca: `T89A${i + 1}`, indicacaoLp: String((i % 3) + 1), local: "Placa de base", tamanho: `${(i % 6) + 2} mm`,
  tipoDefeito: ["IL", "IA", "INR"][i % 3], laudo: ["R", "REC", "A"][i % 3],
}));
const lp = (extra = {}) => ({
  tipo: "LP", codigo: "RLP-089-002", opNumero: "089", revisao: 0, emitidoEm: new Date("2026-10-05T15:00:00Z"),
  inspetor: "Alexandre Stival", marcas: ["T89A1"], linhas: linhasLP(6), observacoes: "Observação curta.",
  equipamentos: instrumentos(4),
  resultados: { desenho: "T89A1", tipoPenetrante: "II", metodo: "C", tempoPenetracao: "15", tempoSecagem: "7", tempoRevelador: "10", temperatura: "28", iluminacao: "1300", ...juntaTripla },
  ...extra,
});
const comum = { cliente: "TERMASA TERMINAL MARÍTIMO DE SANTOS S.A.", obra: "Ampliação do Píer 4 - correia transportadora TC-12", refCliente: "TPR763 / TPR803 / TPR804" };
const palavras = (n, p = "palavra") => Array.from({ length: n }, (_, i) => `${p}${String(i + 1).padStart(3, "0")}`).join(" ");

function dentroDoPapel(itens) {
  for (const it of itens) {
    expect(it.y, `"${it.str}" na folha ${it.pagina}`).toBeGreaterThanOrEqual(28);
    expect(it.y, `"${it.str}" na folha ${it.pagina}`).toBeLessThanOrEqual(it.altura - 28);
  }
}

describe("LP — o rodapé nunca sai do papel", () => {
  it.each([4, 8, 12])("%i instrumentos, junta em três linhas e assinatura desenhada: nomes, datas e certificados dentro da folha", async (n) => {
    const { itens, paginas, todo } = await lerPDF(await gerarPDFdoRelatorio({ rel: lp({ equipamentos: instrumentos(n) }), assinaturas: ASSINADO, ...comum }));
    dentroDoPapel(itens);
    paginas.forEach((t, i) => {
      for (const nome of NOMES) expect(t, `${nome} na folha ${i + 1}`).toContain(nome);
      expect(t, `folha ${i + 1}`).toContain("assinado em 01/10/2026");
    });
    for (const e of instrumentos(n)) expect(todo).toContain(`nº ${e.certificado}`);
  });
});

describe("LP — nada some em silêncio", () => {
  it("as observações saem inteiras — o que não cabe continua na folha seguinte", async () => {
    const obs = palavras(900);
    const { todo, paginas, itens } = await lerPDF(await gerarPDFdoRelatorio({ rel: lp({ observacoes: obs }), assinaturas: ASSINADO, ...comum }));
    for (let i = 1; i <= 900; i++) expect(todo).toContain(`palavra${String(i).padStart(3, "0")}`);
    expect(paginas.length).toBeGreaterThan(1);
    expect(todo).toContain("(continuação)");
    dentroDoPapel(itens);
  });

  it("observação de 4 linhas não sai em cima da borda nem perde a última linha", async () => {
    const obs = palavras(80, "obs");
    const { todo } = await lerPDF(await gerarPDFdoRelatorio({ rel: lp({ observacoes: obs }), ...comum }));
    for (let i = 1; i <= 80; i++) expect(todo).toContain(`obs${String(i).padStart(3, "0")}`);
  });

  it("a observação de cada linha (l.obs) sai impressa, inteira", async () => {
    const obsLinha = "Indicação removida com esmerilhadeira e reensaiada sem nova indicação; liberada pelo inspetor nível 2 em 01/10, conforme o PO-15 item 14 e a AWS D1.1";
    const linhas = [{ ...linhasLP(1)[0], obs: obsLinha }, { ...linhasLP(2)[1], obs: "Segunda observação" }];
    const { todo } = await lerPDF(await gerarPDFdoRelatorio({ rel: lp({ linhas }), ...comum }));
    for (const p of obsLinha.split(" ")) expect(todo).toContain(p);
    expect(todo).toContain("Segunda observação");
  });

  it("célula longa da tabela quebra em vez de cortar com reticência", async () => {
    const local = "Junta alma/mesa do lado A, próxima ao enrijecedor do apoio";
    const marca = "T89A1 / J-12 / J-13 / J-14 / J-15";
    const { todo } = await lerPDF(await gerarPDFdoRelatorio({ rel: lp({ linhas: [{ ...linhasLP(1)[0], local, marca, tamanho: "3 mm x 0,5 mm (linear)" }] }), ...comum }));
    for (const p of [...local.split(" "), ...marca.split(" "), "(linear)"]) expect(todo).toContain(p);
    expect(todo).not.toMatch(/\S\.\.\.(\s|$)/);
  });

  it("cliente, obra e referências longos saem inteiros", async () => {
    const cliente = "CONSÓRCIO CONSTRUTOR DA AMPLIAÇÃO DO TERMINAL MARÍTIMO DE SANTOS - TERMASA / TGG S.A.";
    const obra = "Ampliação do Píer 4 - Estrutura metálica da correia transportadora TC-12 e torres de transferência";
    const { todo } = await lerPDF(await gerarPDFdoRelatorio({ rel: lp(), cliente, obra, refCliente: "TPR763 / TPR803 / TPR804 / TPR805 / TPR806" }));
    for (const p of [...cliente.split(" "), ...obra.split(" "), "TPR806"]) expect(todo).toContain(p);
    expect(todo).not.toMatch(/\S\.\.\.(\s|$)/);
  });

  it("120 peças sem desenho informado: a célula avisa e a relação completa sai inteira no fim", async () => {
    const marcas = Array.from({ length: 120 }, (_, i) => `T112B${i + 1}`);
    const { todo, itens } = await lerPDF(await gerarPDFdoRelatorio({ rel: lp({ marcas, linhas: [], resultados: { ...lp().resultados, desenho: "" } }), assinaturas: ASSINADO, ...comum }));
    for (const m of marcas) expect(todo, m).toMatch(new RegExp(`\\b${m}\\b`));
    expect(todo).toContain("(relação completa ao final)");
    expect(todo).toContain("RELAÇÃO COMPLETA - DESENHO TORG");
    dentroDoPapel(itens);
  });

  it("40 peças sem desenho informado: a relação sai inteira", async () => {
    const marcas = Array.from({ length: 40 }, (_, i) => `T112A${i + 1}`);
    const { todo, itens } = await lerPDF(await gerarPDFdoRelatorio({ rel: lp({ marcas, linhas: [], resultados: { ...lp().resultados, desenho: "" } }), assinaturas: ASSINADO, ...comum }));
    for (const m of marcas) expect(todo, m).toMatch(new RegExp(`\\b${m}\\b`));
    dentroDoPapel(itens);
  });
});

describe("LP — mais de 20 linhas e fotos", () => {
  const fotos = Array.from({ length: 7 }, (_, i) => ({ url: null, marca: i % 2 ? `T89A${i + 1}` : null, observacao: `Revelação número ${i + 1}` }));
  const rel = () => lp({ linhas: linhasLP(30), marcas: Array.from({ length: 30 }, (_, i) => `T89A${i + 1}`), observacoes: palavras(120), equipamentos: instrumentos(4) });

  it("assinaturas em TODAS as folhas, inclusive nas de foto — com os mesmos papéis do formulário", async () => {
    const { paginas, itens } = await lerPDF(await gerarPDFdoRelatorio({ rel: rel(), fotos, assinaturas: ASSINADO, ...comum }));
    expect(paginas.length).toBeGreaterThanOrEqual(3);
    paginas.forEach((t, i) => {
      expect(t, `folha ${i + 1}`).toContain("Identif. do inspetor / Nível");
      expect(t, `folha ${i + 1}`).not.toContain("Realizado por");
      for (const nome of NOMES) expect(t, `${nome} na folha ${i + 1}`).toContain(nome);
    });
    dentroDoPapel(itens);
  });

  it("FOLHA x DE y bate em todas as folhas, contando as de foto", async () => {
    const { paginas } = await lerPDF(await gerarPDFdoRelatorio({ rel: rel(), fotos, assinaturas: ASSINADO, ...comum }));
    const N = paginas.length;
    paginas.forEach((t, i) => expect(t, `folha ${i + 1}`).toMatch(new RegExp(`\\b${i + 1} DE ${N}\\b`)));
    for (let i = 1; i <= 7; i++) expect(paginas.join(" ")).toContain(`Revelação número ${i}`);
  });

  it("as 30 linhas saem todas, e a folha de fotos diz de que relatório é", async () => {
    const { paginas, todo } = await lerPDF(await gerarPDFdoRelatorio({ rel: rel(), fotos, assinaturas: ASSINADO, ...comum }));
    for (let i = 1; i <= 30; i++) expect(todo).toMatch(new RegExp(`\\bT89A${i}\\b`));
    const deFoto = paginas.filter((t) => t.includes("Revelação número"));
    expect(deFoto.length).toBeGreaterThan(0);
    for (const t of deFoto) expect(t).toContain("REGISTRO DE ENSAIO POR LÍQUIDO PENETRANTE");
  });

  it("fluorescente sem nenhuma linha (só os padrões da criação): folha inteira dentro do papel", async () => {
    const { itens, paginas } = await lerPDF(await gerarPDFdoRelatorio({ rel: lp({ linhas: [], observacoes: null, equipamentos: [], resultados: { tipoPenetrante: "I", metodo: "A", iluminacao: "5", uv: "1200" } }), ...comum }));
    expect(paginas).toHaveLength(1);
    expect(paginas[0]).toContain("Tipo I - Fluorescente");
    dentroDoPapel(itens);
  });
});
