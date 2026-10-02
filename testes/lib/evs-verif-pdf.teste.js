// "Garanta que nada fique faltando" (Vitor, 02/10/2026). A verificação do relatório de inspeção visual
// de solda (EVS) gerou PDFs nos limites e achou: o rodapé saindo do papel com a assinatura desenhada e
// seis instrumentos, a folha 1 sem assinaturas quando passava de 26 juntas, comentários cortados em duas
// linhas, a observação de cada junta nunca impressa, "FOLHA 1 DE 2" num documento de quatro folhas,
// tipo de estrutura e componente que não iam para o papel, procedimento/obra/desenho cortados com "...",
// o desenho do cliente trocado pela referência do cliente, a 4ª EPS sumindo e a iluminação sem unidade.
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
    for (const it of items) if (it.str.trim()) itens.push({ pagina: p, str: it.str, x: it.transform[4], y: it.transform[5], altura: height });
    paginas.push(items.map((it) => it.str).join(" ").replace(/\s+/g, " "));
  }
  return { itens, paginas, todo: paginas.join(" ") };
}

// assinatura com imagem cadastrada: o bloco sobe de 54 para 118 pt (a imagem em si não precisa baixar)
beforeAll(() => vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("sem rede no teste"); })));
afterAll(() => vi.unstubAllGlobals());

const instrumentos = (n) => Array.from({ length: n }, (_, i) => ({ id: `e${i}`, nome: `Instrumento calibrado número ${i + 1}`, certificado: `CERT-${i + 1}`, vencido: i === 3 }));
const assinaturasComImagem = [
  { setor: "Inspetor", nome: "Alexandre Stival", assinadoEm: new Date("2026-10-01T10:00:00Z"), imagemUrl: "https://exemplo.invalid/a.png" },
  { setor: "Torg Metal", nome: "Geraldo Tank", assinadoEm: new Date("2026-10-01T12:00:00Z"), imagemUrl: "https://exemplo.invalid/g.png" },
  { setor: "Cliente", nome: "Davi Pinho", assinadoEm: new Date("2026-10-02T12:00:00Z"), imagemUrl: "https://exemplo.invalid/d.png" },
];
const palavras = (n, p = "palavra") => Array.from({ length: n }, (_, i) => `${p}${String(i + 1).padStart(3, "0")}`).join(" ");
const SOLD = [["VANDO MAXIMO RODRIGUES DE JESUS", "S-04"], ["FRANCISCO DE ASSIS DOS SANTOS PEREIRA", "S-07"], ["DANIEL DA SILVA", "S-01"]];
/** `n` juntas, cada uma com uma descrição única (J001, J002…) para conferir que nenhuma sumiu. */
const juntas = (n, extra = () => ({})) => Array.from({ length: n }, (_, i) => ({
  marca: `T89A${(i % 3) + 1}`, qtd: (i % 3) + 1, descricao: `J${String(i + 1).padStart(3, "0")} filete alma/mesa`,
  eps: "EPS-RQPS 01", soldador: SOLD[i % 3][0], sinete: SOLD[i % 3][1], descontinuidade: i % 4 === 1 ? "MO" : "", laudo: i % 4 === 1 ? "REC" : "A",
  ...extra(i),
}));
const evs = (extra = {}, res = {}) => ({
  tipo: "VISUAL_SOLDA", codigo: "EVS-089-003", opNumero: "089", revisao: 0, emitidoEm: new Date("2026-10-01T15:00:00Z"),
  inspetor: "Alexandre Stival", marcas: ["T89A1", "T89A2", "T89A3"], linhas: juntas(8), observacoes: "Juntas inspecionadas após limpeza.",
  equipamentos: instrumentos(2),
  resultados: {
    tiposPeca: { T89A1: "COLUNA", T89A2: "VIGA" }, qtdPeca: { T89A1: 4, T89A2: 2, T89A3: 2 },
    desenho: "T89A1 R0, T89A2 R0, T89A3 R1", revisaoDesenho: "R0", desenhoCliente: "DE-4500-TC12-001", revisaoCliente: "C",
    metalBase: "Aço carbono", metalAdicao: "ER70S-6, E7018", condicoes: "Escovada", iluminacao: "1250",
    processoSolda: "GMAW, SMAW", eps: "EPS 001/2025, EPS 004/2025", rqs: "RQPS 001/2025, RQPS 004/2025", tipoJunta: "Topo e ângulo",
    tecnica: "Visual direta", procedimento: "PO-06 Ensaio Visual e Dimensional de Soldas - R1",
    criterio: "AWS D1.1:2025 - tabela 11 do PO-06 (item 9.4)", tipoPeca: "Treliça", componente: "Ligação viga-coluna",
    ...res,
  },
  ...extra,
});
const gerar = (rel, outros = {}) => gerarPDFdoRelatorio({ rel, fotos: [], assinaturas: null, cliente: "TERMASA TERMINAL MARÍTIMO DE SANTOS S.A.", obra: "Píer 4", refCliente: "REF-77", ...outros });

/**
 * Todo texto dentro da folha útil (margem de 28 pt) e as assinaturas em todas as folhas.
 *
 * ⚠ O QUE CAI ABAIXO DO PAPEL NÃO É DEVOLVIDO pelo leitor de PDF — some do texto extraído. Com 12
 * instrumentos o nome de quem assinou estava em y negativo e "todo texto acima de 28" passava por
 * vacuidade. Por isso, com assinaturas, cada folha tem de MOSTRAR os nomes.
 */
function conferirFolhas({ itens, paginas }, assinaturas = null) {
  for (const it of itens) {
    expect(it.y, `"${it.str}" na folha ${it.pagina}`).toBeGreaterThanOrEqual(28);
    expect(it.y, `"${it.str}" na folha ${it.pagina}`).toBeLessThanOrEqual(it.altura - 28);
  }
  paginas.forEach((t, i) => {
    expect(t, `folha ${i + 1}`).toContain("Realizado por");
    expect(t, `folha ${i + 1}`).toContain("Cliente / Fiscalização");
    expect(t, `folha ${i + 1}`).toContain(`${i + 1} DE ${paginas.length}`);
    for (const a of assinaturas || []) expect(t, `assinatura de ${a.nome} na folha ${i + 1}`).toContain(a.nome);
  });
}

describe("EVS — o rodapé nunca sai do papel (achado 1)", () => {
  it.each([2, 6, 12])("%i instrumentos com assinatura desenhada: tudo dentro da folha, todos os certificados impressos", async (n) => {
    const lido = await lerPDF(await gerar(evs({ equipamentos: instrumentos(n) }), { assinaturas: assinaturasComImagem }));
    conferirFolhas(lido, assinaturasComImagem);
    for (let i = 1; i <= n; i++) expect(lido.todo).toMatch(new RegExp(`nº CERT-${i}\\b`));
    expect(lido.todo).toContain("Juntas inspecionadas após limpeza.");
  });
});

describe("EVS — mais juntas do que cabem numa folha (achado 2)", () => {
  it.each([30, 60])("%i juntas: nenhuma some, assinaturas em todas as folhas, observações e instrumentos depois da última junta", async (n) => {
    const lido = await lerPDF(await gerar(evs({ linhas: juntas(n), equipamentos: instrumentos(6) }), { assinaturas: assinaturasComImagem }));
    conferirFolhas(lido, assinaturasComImagem);
    for (let i = 1; i <= n; i++) expect(lido.todo).toContain(`J${String(i).padStart(3, "0")}`);
    const ultimaJunta = lido.itens.find((it) => it.str.includes(`J${String(n).padStart(3, "0")}`));
    const obs = lido.itens.find((it) => it.str.startsWith("OBSERVAÇÕES"));
    const instr = lido.itens.find((it) => it.str.includes("nº CERT-6"));
    expect(obs.pagina).toBeGreaterThanOrEqual(ultimaJunta.pagina);
    expect(instr.pagina).toBeGreaterThanOrEqual(ultimaJunta.pagina);
    // a tabela que continua diz isso nas duas pontas
    expect(lido.todo).toContain("REGISTROS DOS RESULTADOS (continuação)");
    expect(lido.todo).toContain("continua na folha seguinte");
  });
});

describe("EVS — texto inteiro, nunca cortado", () => {
  it("comentário de 1000 caracteres sai inteiro (achado 3)", async () => {
    const obs = palavras(140).slice(0, 1000);
    const { todo } = await lerPDF(await gerar(evs({ observacoes: obs })));
    for (const p of obs.split(" ")) expect(todo).toContain(p);
  });

  it("comentário muito longo continua na folha seguinte, sem sair do papel", async () => {
    const obs = palavras(900);
    const lido = await lerPDF(await gerar(evs({ observacoes: obs }), { assinaturas: assinaturasComImagem }));
    for (let i = 1; i <= 900; i++) expect(lido.todo).toContain(`palavra${String(i).padStart(3, "0")}`);
    expect(lido.todo).toContain("OBSERVAÇÕES (continuação)");
    conferirFolhas(lido, assinaturasComImagem);
  });

  it("procedimento, obra e desenho Torg longos saem inteiros (achado 7)", async () => {
    const obra = "Ampliação do Píer 4 - Estrutura metálica da correia transportadora TC-12 e torres de transferência";
    const marcas40 = Array.from({ length: 40 }, (_, i) => `T89A${i + 1}`);
    const rel = evs({ marcas: marcas40, linhas: juntas(2) }, { desenho: marcas40.map((m) => `${m} R0`).join(", ") });
    const lido = await lerPDF(await gerar(rel, { obra }));
    for (const p of "PO-06 Ensaio Visual e Dimensional de Soldas - R1".split(" ")) expect(lido.todo).toContain(p);
    for (const p of obra.split(" ")) expect(lido.todo).toContain(p);
    for (const m of marcas40.slice(3)) expect(lido.todo).toMatch(new RegExp(`\\b${m} R0\\b`));
    expect(lido.todo).not.toContain("...");
    conferirFolhas(lido);
  });

  it("identificação enorme (além do teto das rotas): ela continua na folha seguinte e a tabela vem depois — nada sai do papel", async () => {
    const marcas = Array.from({ length: 120 }, (_, i) => `T89A${i + 1}`);
    // 100: a tabela ainda começa na folha 1 · 130: nem uma junta cabe, a tabela começa na 2 · 190: a própria
    // identificação continua na folha 2 (medido com as amostras de 02/10/2026)
    for (const n of [100, 130, 190]) {
      const obra = palavras(n, "obra");
      const rel = evs({ marcas, linhas: juntas(12) }, { desenho: marcas.map((m) => `${m} R0`).join(", ") });
      const lido = await lerPDF(await gerar(rel, { obra, assinaturas: assinaturasComImagem }));
      conferirFolhas(lido, assinaturasComImagem);
      for (let i = 1; i <= n; i++) expect(lido.todo, `obra de ${n} palavras`).toContain(`obra${String(i).padStart(3, "0")}`);
      for (let i = 1; i <= 12; i++) expect(lido.todo, `obra de ${n} palavras`).toContain(`J${String(i).padStart(3, "0")}`);
      expect(lido.todo).toMatch(/\bT89A120 R0\b/);
    }
  }, 30000);

  it("célula da tabela quebra em vez de cortar: descrição longa e soldador de nome comprido", async () => {
    const descricao = "Filete enrijecedor 8 mm ambos os lados da alma, lado norte";
    const rel = evs({ linhas: juntas(3, () => ({ descricao, descontinuidade: "PO RE MO OV CO AA DI" })) });
    const { todo } = await lerPDF(await gerar(rel));
    for (const p of descricao.split(" ")) expect(todo).toContain(p);
    expect(todo).toContain("FRANCISCO");
    expect(todo).toContain("PEREIRA");
    for (const c of ["PO", "RE", "MO", "OV", "CO", "AA", "DI"]) expect(todo).toMatch(new RegExp(`\\b${c}\\b`));
    expect(todo).not.toContain("...");
  });

  it("as quatro EPS e RQS saem todas (achado 9)", async () => {
    const rel = evs({}, {
      eps: "EPS 001/2025, EPS 002/2025, EPS 004/2025, EPS 005/2025", rqs: "RQPS 001/2025, RQPS 002/2025, RQPS 004/2025, RQPS 005/2025",
      processoSolda: "GMAW, FCAW, SMAW", metalAdicao: "ER70S-6, E71T-1C, E7018",
    });
    const { todo } = await lerPDF(await gerar(rel));
    for (const v of ["EPS 002/2025", "EPS 005/2025", "RQPS 002/2025", "RQPS 005/2025", "E71T-1C", "SMAW"]) expect(todo).toContain(v);
  });
});

describe("EVS — o que era pedido na tela e não ia para o papel", () => {
  it("a observação de cada junta sai logo abaixo dela (achado 4)", async () => {
    const rel = evs({ linhas: juntas(4, (i) => (i === 2 ? { obs: "Trinca na raiz do filete, RNC-089-004 aberta" } : {})) });
    const { itens } = await lerPDF(await gerar(rel));
    const obs = itens.find((it) => it.str.includes("RNC-089-004"));
    expect(obs, "observação da junta J003").toBeTruthy();
    const j3 = itens.find((it) => it.str.startsWith("J003"));
    const j4 = itens.find((it) => it.str.startsWith("J004"));
    expect(obs.pagina).toBe(j3.pagina);
    expect(obs.y).toBeLessThan(j3.y);
    expect(obs.y).toBeGreaterThan(j4.y);
  });

  it("tipo de estrutura e componente saem mesmo com a descrição das peças vinda da lista (achado 6)", async () => {
    const { todo } = await lerPDF(await gerar(evs()));
    expect(todo).toContain("TIPO DE ESTRUTURA:");
    expect(todo).toContain("Treliça");
    expect(todo).toContain("COMPONENTE:");
    expect(todo).toContain("Ligação viga-coluna");
    expect(todo).toContain("COLUNA, VIGA");
  });

  it("desenho do cliente vazio fica vazio — a referência do cliente não vira número de desenho (achado 8)", async () => {
    const { todo } = await lerPDF(await gerar(evs({}, { desenhoCliente: "" })));
    expect(todo.split("REF-77").length - 1).toBe(1);
  });

  it("iluminação só com número ganha a unidade; com a unidade já escrita, não repete (achado 10)", async () => {
    expect((await lerPDF(await gerar(evs()))).todo).toContain("1250 lux");
    const comUnidade = (await lerPDF(await gerar(evs({}, { iluminacao: "1300 lux" })))).todo;
    expect(comUnidade).toContain("1300 lux");
    expect(comUnidade).not.toMatch(/lux\s+lux/);
    const decimal = (await lerPDF(await gerar(evs({}, { iluminacao: "1076,5" })))).todo;
    expect(decimal).toContain("1076,5 lux");
  });
});

describe("EVS — FOLHA x DE y conta as folhas de foto (achado 5)", () => {
  it("30 juntas e 7 fotos: o mesmo total em todas as folhas, assinaturas em todas", async () => {
    const fotos = Array.from({ length: 7 }, (_, i) => ({ url: null, marca: "T89A1", observacao: `Foto número ${i + 1}` }));
    const lido = await lerPDF(await gerar(evs({ linhas: juntas(30), equipamentos: instrumentos(6) }), { fotos, assinaturas: assinaturasComImagem }));
    expect(lido.paginas.length).toBeGreaterThanOrEqual(3);
    conferirFolhas(lido, assinaturasComImagem);
    for (let i = 1; i <= 7; i++) expect(lido.todo).toContain(`Foto número ${i}`);
  });

  it("vazio (folha para preencher à mão): uma folha só, com o quadro inteiro", async () => {
    const rel = evs({ linhas: [], resultados: {}, observacoes: null, equipamentos: [], marcas: [] });
    const lido = await lerPDF(await gerarPDFdoRelatorio({ rel, fotos: [], assinaturas: null, cliente: "C", obra: "O", refCliente: null }));
    expect(lido.paginas).toHaveLength(1);
    conferirFolhas(lido);
    for (const r of ["REGISTROS DOS RESULTADOS", "LEGENDA", "OBSERVAÇÕES:", "*Equipamentos utilizados:", "TIPO DE ESTRUTURA:", "COMPONENTE:"]) expect(lido.todo).toContain(r);
  });
});
