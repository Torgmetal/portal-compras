// "Garanta que nada fique faltando" (Vitor, 02/10/2026). A verificação dos modelos gerou PDFs de sais e
// poeira nos limites e achou: 20 de 40 marcas sumindo da célula de peças, observações cortadas em duas
// linhas, a legenda das fotos 1 e 2 nunca impressa, a data do ensaio que não existia e o bloco das
// assinaturas saindo do papel com seis instrumentos. Aqui cada um desses casos é gerado e o PDF é LIDO
// de volta — o texto e a posição de cada pedaço dele.
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

const marcas = Array.from({ length: 40 }, (_, i) => `T112A${i + 1}`);
const palavras = (n, p = "palavra") => Array.from({ length: n }, (_, i) => `${p}${String(i + 1).padStart(3, "0")}`).join(" ");
const instrumentos = Array.from({ length: 12 }, (_, i) => ({ id: `e${i}`, nome: `Instrumento de medição número ${i + 1}`, certificado: `CERT-${i + 1}`, vencido: i === 3 }));
const assinaturas = [
  { setor: "inspetor", nome: "Geraldo Tank", assinadoEm: new Date("2026-10-02T13:00:00Z"), imagemUrl: "https://exemplo.invalid/ass.png" },
  { setor: "torg metal", nome: "Vitor Costa", assinadoEm: new Date("2026-10-02T14:00:00Z") },
];
const base = { opNumero: "112", revisao: 0, createdAt: new Date("2026-09-28T12:00:00Z"), inspetor: "Geraldo Tank" };
const sais = (extra = {}) => ({
  ...base, tipo: "SAIS", codigo: "RCS-112-001",
  resultados: { etapaPintura: "Após o jateamento", requisito: "20", apModelo: "EC-33", apTag: "CD-01", amostras: [{ condAgua: "0.125", condAmostra: "10.125", hora: "09:10" }], ...extra },
});
const poeira = (extra = {}) => ({
  ...base, tipo: "POEIRA", codigo: "RTP-112-001", resultadoInspecao: "APROVADO",
  resultados: { etapaPintura: "Antes da 1ª demão", fitaAdesiva: "Fita 25 mm", testes: [{ local: "Alma", quantidade: "1", tamanho: "2" }], ...extra },
});

describe.each([["sais", sais], ["poeira", poeira]])("%s — nada falta, nada sai do papel", (_, montar) => {
  it("40 marcas: a célula avisa e a relação completa sai inteira no fim", async () => {
    const { todo } = await lerPDF(await gerarPDFdoRelatorio({ rel: { ...montar(), marcas } }));
    for (const m of marcas) expect(todo, m).toMatch(new RegExp(`\\b${m}\\b`));
    expect(todo).toContain("relação completa ao final");
    expect(todo).toContain("RELAÇÃO COMPLETA DAS PEÇAS INSPECIONADAS");
  });

  it("observação longa sai inteira — o que não cabe continua na folha seguinte", async () => {
    const obs = palavras(900);
    const { todo, paginas } = await lerPDF(await gerarPDFdoRelatorio({ rel: { ...montar(), marcas: ["T112A1"], observacoes: obs } }));
    for (let i = 1; i <= 900; i++) expect(todo).toContain(`palavra${String(i).padStart(3, "0")}`);
    expect(paginas.length).toBeGreaterThan(1);
    expect(todo).toContain("OBSERVAÇÕES (continuação)");
  });

  it("12 instrumentos, assinatura desenhada, 2 fotos e observação longa: todo texto dentro da folha, assinaturas em todas", async () => {
    const rel = { ...montar(), marcas: ["T112A1"], observacoes: palavras(150), equipamentos: instrumentos };
    const fotos = [{ url: null, marca: "T112A1", observacao: "Alma" }, { url: null, observacao: "Mesa" }, { url: null, observacao: "Terceira" }];
    const { itens, paginas } = await lerPDF(await gerarPDFdoRelatorio({ rel, fotos, assinaturas }));
    for (const it of itens) {
      expect(it.y, `"${it.str}" na folha ${it.pagina}`).toBeGreaterThanOrEqual(28);
      expect(it.y, `"${it.str}" na folha ${it.pagina}`).toBeLessThanOrEqual(it.altura - 28);
    }
    paginas.forEach((t, i) => expect(t, `folha ${i + 1}`).toContain("Inspetor CQ"));
    for (const e of instrumentos) expect(paginas.join(" ")).toContain(`nº ${e.certificado}`);
  });

  it("FOLHA x DE y bate em todas as folhas, inclusive nas de foto", async () => {
    const rel = { ...montar(), marcas, observacoes: palavras(300), equipamentos: instrumentos };
    const fotos = Array.from({ length: 9 }, (_, i) => ({ url: null, observacao: `Foto número ${i + 1}` }));
    const { paginas } = await lerPDF(await gerarPDFdoRelatorio({ rel, fotos, assinaturas }));
    paginas.forEach((t, i) => expect(t, `folha ${i + 1}`).toContain(`${i + 1} DE ${paginas.length}`));
    for (let i = 1; i <= 9; i++) expect(paginas.join(" ")).toContain(`Foto número ${i}`);
  });

  it("a legenda das fotos 1 e 2 é o que o inspetor escreveu (marca · observação)", async () => {
    const fotos = [{ url: null, marca: "T112A7", observacao: "Pó acumulado na alma" }, { url: null, observacao: "Mesa inferior" }];
    const { paginas } = await lerPDF(await gerarPDFdoRelatorio({ rel: { ...montar(), marcas: ["T112A7"] }, fotos }));
    expect(paginas).toHaveLength(1);
    expect(paginas[0]).toContain("T112A7 · Pó acumulado na alma");
    expect(paginas[0]).toContain("Mesa inferior");
  });

  it("a data do ensaio sai como foi digitada — sem voltar um dia pelo fuso", async () => {
    const { todo } = await lerPDF(await gerarPDFdoRelatorio({ rel: montar({ dataInspecao: "2026-10-01" }) }));
    expect(todo).toContain("DATA DO ENSAIO: 01/10/2026");
    const semData = await lerPDF(await gerarPDFdoRelatorio({ rel: montar() }));
    expect(semData.todo).toContain("DATA DO ENSAIO: 28/09/2026"); // sem data: a de criação
  });
});

describe("detalhes de cada modelo", () => {
  it("sais: a leitura do aparelho sai como foi lida, no padrão brasileiro (0.125 → 0,125)", async () => {
    const { todo } = await lerPDF(await gerarPDFdoRelatorio({ rel: sais() }));
    expect(todo).toContain("0,125");
    expect(todo).toContain("10,125");
    expect(todo).toMatch(/12,0\*/); // Δ 10 → 12 mg/m² calculado, sempre com uma casa
  });

  it("poeira: local e observação longos saem inteiros, e a classe marcada abaixo da maior mostra a maior", async () => {
    const local = "Alma da viga principal, região próxima ao enrijecedor do apoio norte";
    const obs = "Poeira fina concentrada junto à solda, removida com ar comprimido seco antes do novo teste";
    const rel = poeira({ classificacao: "2", testes: [{ local, quantidade: "2", tamanho: "4", obs }] });
    const { todo } = await lerPDF(await gerarPDFdoRelatorio({ rel }));
    for (const p of local.split(" ").concat(obs.split(" "))) expect(todo).toContain(p);
    expect(todo).toContain("Classe 2 (maior encontrada: 4)");
  });
});
