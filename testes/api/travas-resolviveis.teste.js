// "Garanta que nada fique travado" (Vitor, 02/10/2026). Toda trava de assinatura cobra campos — e cobrar um
// campo que a rota DESCARTA ao gravar deixa o relatório preso para sempre (as rotas têm lista fechada).
// Aqui cada tipo é preenchido COMPLETO pelo caminho que a tela usa, e depois de gravado nenhuma pendência
// pode sobrar: pelo computador (onde se envia para assinatura) e pelo celular (o que o celular mede).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";
const mocks = vi.hoisted(() => ({ role: vi.fn(), salvar: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/session", () => ({ requireRole: mocks.role, requireAdminDoPortal: vi.fn() }));
vi.mock("@/lib/padroes-inspecao", async (orig) => ({ ...(await orig()), salvarInspecaoComPadroes: mocks.salvar }));
vi.mock("@/lib/relatorio-inspecao", () => ({ vincularNoDataBook: vi.fn(), pendenciasParaAssinatura: () => [] }));

import { PATCH as patchPC } from "@/app/api/qualidade/inspecoes/[id]/route";
import { PATCH as patchCampo } from "@/app/api/campo/relatorios/[id]/route";
import { pendenciasParaAssinatura } from "@/lib/qualidade-campo";
import { ITENS_RECEBIMENTO } from "@/lib/recebimento-tinta-campos";

let rel;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.role.mockResolvedValue({ id: "u", name: "Geraldo", tipo: "ADMIN", modulos: ["QUALIDADE"] });
  mocks.salvar.mockImplementation(async (r, dados) => (rel = { ...r, ...dados }));
  mockPrisma.relatorioInspecao.findUnique.mockImplementation(async () => rel);
  mockPrisma.relatorioInspecao.update.mockImplementation(async ({ data }) => (rel = { ...rel, ...data }));
  mockPrisma.auditLog.create.mockResolvedValue({});
  mockPrisma.assinaturaDocumento.findMany.mockResolvedValue([]);
  mockPrisma.pecaConjunto.findMany.mockResolvedValue([]);
});
const pc = (body) => patchPC(new Request("http://localhost/api/qualidade/inspecoes/r", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ id: "r" }) });
const campo = (body) => patchCampo(new Request("http://localhost", { method: "PATCH", body: JSON.stringify(body) }), { params: { id: "r" } });

const instrumento = [{ id: "lx", nome: "LX-01 Luxímetro", certificado: "C-1" }];
const cota = { marca: "T1", letra: "A", descricao: "Cota A", projetoMm: 100, tolerancia: "± 2" };
const verif = { dimensional: "APROVADO", alinhamento: "APROVADO", acabamento: "APROVADO" };

// por tipo: o relatório como nasce, o corpo do COMPUTADOR e o do CELULAR (só o que o celular edita)
const CASOS = {
  // ⚠ medida nova exige o instrumento (regra de antes: "um ensaio sem dizer com o que foi medido não vale") —
  // não é trava sem saída, o instrumento tem onde ser escolhido nas duas telas
  DIMENSIONAL: {
    nasce: { linhas: [cota] },
    pc: { linhas: [{ ...cota, encontradoMm: 101 }], resultados: verif, pecasInformadas: [{ marca: "T1", quantidade: 2 }], equipamentos: instrumento, resultadoInspecao: "APROVADO" },
    campo: { medidas: [{ i: 0, encontradoMm: 101 }], condicoes: verif, pecasInformadas: [{ marca: "T1", quantidade: 2 }], equipamentos: instrumento, resultadoInspecao: "APROVADO" },
  },
  PRE_MONTAGEM: {
    nasce: { linhas: [cota] },
    pc: { linhas: [{ ...cota, encontradoMm: 101 }], resultados: verif, equipamentos: instrumento, resultadoInspecao: "APROVADO" },
    campo: { medidas: [{ i: 0, encontradoMm: 101 }], condicoes: verif, equipamentos: instrumento, resultadoInspecao: "APROVADO" },
  },
  VISUAL_SOLDA: {
    nasce: {},
    pc: { linhas: [{ marca: "T1", laudo: "A" }], resultados: { iluminacao: "1250" }, equipamentos: instrumento, resultadoInspecao: "APROVADO" },
    campo: { medidas: [{ i: 0, marca: "T1", laudo: "A" }], condicoes: { iluminacao: "1250" }, equipamentos: instrumento, resultadoInspecao: "APROVADO" },
  },
  LP: {
    nasce: {},
    pc: { linhas: [{ marca: "T1", laudo: "A" }], resultados: { tipoPenetrante: "II" }, equipamentos: instrumento, resultadoInspecao: "APROVADO" },
    campo: { medidas: [{ i: 0, marca: "T1", laudo: "A" }], condicoes: { tipoPenetrante: "II" }, equipamentos: instrumento, resultadoInspecao: "APROVADO" },
  },
  ULTRASSOM: {
    // a indicação lançada no celular, ainda sem laudo (peça sem indicação sai "A" sozinha e não trava)
    nasce: { linhas: [{ peca: "T1", marca: "T1", indicacao: "1" }] },
    pc: { linhas: [{ peca: "T1", indicacao: "1", laudo: "R" }], resultadoInspecao: "REPROVADO" },
    campo: { medidas: [{ i: 0, marca: "T1", indicacao: "1", laudo: "R" }], resultadoInspecao: "REPROVADO" },
  },
  PINTURA: {
    // o procedimento de preparo NASCE preenchido (padrões da casa) e o celular não o edita
    nasce: { resultados: { prepProcedimento: "Jateamento abrasivo", demaos: { 1: { data: "2026-10-01" } } } },
    pc: { resultados: { prepProcedimento: "Jateamento abrasivo", demaos: { 1: { data: "2026-10-01", hIni: "08:00", hFim: "10:00", visual: "Conforme" } } }, resultadoInspecao: "APROVADO" },
    campo: { condicoes: { demaos: { 1: { data: "2026-10-01", hIni: "08:00", hFim: "10:00", visual: "Conforme" } } }, resultadoInspecao: "APROVADO" },
  },
  SAIS: {
    nasce: {},
    pc: { resultados: { etapaPintura: "Após o jateamento", requisito: "20", apModelo: "EC-33", apTag: "CD-01", amostras: [{ condAgua: "1", condAmostra: "11", hora: "09:10" }] }, resultadoInspecao: "APROVADO" },
    campo: { condicoes: { etapaPintura: "Após o jateamento", requisito: "20", apModelo: "EC-33", apTag: "CD-01", amostras: [{ condAgua: "1", condAmostra: "11", hora: "09:10" }] }, resultadoInspecao: "APROVADO" },
  },
  POEIRA: {
    nasce: {},
    pc: { resultados: { etapaPintura: "Antes da 1ª demão", fitaAdesiva: "Fita 25 mm", testes: [{ quantidade: "1", tamanho: "2" }] }, resultadoInspecao: "APROVADO" },
    campo: { condicoes: { etapaPintura: "Antes da 1ª demão", fitaAdesiva: "Fita 25 mm", testes: [{ quantidade: "1", tamanho: "2" }] }, resultadoInspecao: "APROVADO" },
  },
  PULL_OFF: {
    nasce: {},
    pc: { resultados: { adesivo: "Araldite", aparelho: "Elcometer 510", dataFixacao: "2026-10-01", dataArrancamento: "2026-10-02", dollies: [{ adesao: "8", falha: "Coesão" }] }, resultadoInspecao: "APROVADO" },
    campo: { condicoes: { adesivo: "Araldite", aparelho: "Elcometer 510", dataFixacao: "2026-10-01", dataArrancamento: "2026-10-02", dollies: [{ adesao: "8", falha: "Coesão" }] }, resultadoInspecao: "APROVADO" },
  },
  RECEBIMENTO_TINTA: {
    nasce: {},
    pc: { resultados: { material: "Wegpoxi", fabricante: "WEG", dataInspecao: "2026-10-01", lotes: [{ lote: "L1", validade: "2027-03-15" }], checklist: Object.fromEntries(ITENS_RECEBIMENTO.map((_, i) => [i + 1, "A"])) }, resultadoInspecao: "APROVADO" },
    campo: { condicoes: { material: "Wegpoxi", fabricante: "WEG", dataInspecao: "2026-10-01", lotes: [{ lote: "L1", validade: "2027-03-15" }], checklist: Object.fromEntries(ITENS_RECEBIMENTO.map((_, i) => [i + 1, "A"])) }, resultadoInspecao: "APROVADO" },
  },
  // os recebimentos por certificado (07/10/2026): nascem com os certificados do CMR, sem as três marcas
  RECEBIMENTO_PENETRANTE: {
    nasce: { resultados: { itens: [{ docId: "d1", r: "261266", descricao: "REVELADOR METALCHECK D-70", certificado: "202600149" }] } },
    pc: { resultados: { itens: [{ docId: "d1", r: "261266", descricao: "REVELADOR METALCHECK D-70", certificado: "202600149", visual: "A", dimensional: "NA", documentos: "A" }] }, resultadoInspecao: "APROVADO" },
    campo: { condicoes: { itens: [{ docId: "d1", r: "261266", descricao: "REVELADOR METALCHECK D-70", certificado: "202600149", visual: "A", dimensional: "NA", documentos: "A" }] }, resultadoInspecao: "APROVADO" },
  },
  RECEBIMENTO_ARAME: {
    nasce: { resultados: { itens: [{ docId: "d2", r: "260005", descricao: "ARAME TUBULAR METAL CORE 71C", certificado: "149793" }] } },
    pc: { resultados: { itens: [{ docId: "d2", r: "260005", descricao: "ARAME TUBULAR METAL CORE 71C", certificado: "149793", visual: "A", dimensional: "A", documentos: "A" }] }, resultadoInspecao: "APROVADO" },
    campo: { condicoes: { itens: [{ docId: "d2", r: "260005", descricao: "ARAME TUBULAR METAL CORE 71C", certificado: "149793", visual: "A", dimensional: "A", documentos: "A" }] }, resultadoInspecao: "APROVADO" },
  },
};

describe.each(Object.entries(CASOS))("%s: toda trava tem como ser resolvida", (tipo, caso) => {
  const nascer = () => {
    rel = { id: "r", codigo: "X-112-001", opNumero: "112", tipo, revisao: 0, marcas: ["T1"], linhas: [], equipamentos: [], resultados: {}, envioAssinaturaId: null, ...JSON.parse(JSON.stringify(caso.nasce)) };
  };
  it("nasce com pendência (a trava existe)", () => {
    nascer();
    expect(pendenciasParaAssinatura(rel).length).toBeGreaterThan(0);
  });
  it("preenchido pelo computador, nada sobra", async () => {
    nascer();
    expect((await pc(caso.pc)).status).toBe(200);
    expect(pendenciasParaAssinatura(rel)).toEqual([]);
  });
  it("medido pelo celular, nada sobra", async () => {
    nascer();
    expect((await campo(caso.campo)).status).toBe(200);
    expect(pendenciasParaAssinatura(rel)).toEqual([]);
  });
});
