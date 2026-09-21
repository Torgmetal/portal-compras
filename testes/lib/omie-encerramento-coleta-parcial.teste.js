// ⚠⚠ SÃO DUAS COLETAS NO OMIE, E AS DUAS CONTAM PARA `completa` (achado do Codex, 17/09/2026).
//
// `reconciliarSemTrava` pesquisa os ENCERRADOS e, para os candidatos a reabertura, pesquisa de
// novo os PENDENTES. Antes desta correção `completa` olhava só a primeira: a segunda podendo parar
// por tempo, a rodada se anunciava "completa" com `motivo` preenchido — e quem lê o estado, não o
// motivo, tomava uma coleta pela metade por retrato inteiro. No botão "Sincronizar" isso vira um
// "pronto" verde numa rodada que não terminou.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "@/testes/apoio/prisma";

const mocks = vi.hoisted(() => ({ coletar: vi.fn(), trava: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma, prismaDirect: mockPrisma }));
vi.mock("@/lib/cron-trava", () => ({ comTravaDeCron: mocks.trava }));
vi.mock("@/lib/omie-call", () => ({ omieCall: mocks.coletar, ORCAMENTO_ESGOTADO: "orçamento" }));

import { reconciliarEncerramentos } from "@/lib/omie-encerramento";

/** Uma página de resposta do `PesquisarPedCompra`. */
const pagina = (codigos) => ({
  nTotalPaginas: 1,
  pedidos_pesquisa: codigos.map((c) => ({ cabecalho_consulta: { nCodPed: c } })),
});

const PEDIDOS = [
  { id: "a", codigoPedido: "1", encerradoOmieEm: null, createdAt: new Date("2026-08-01") },
  // já marcado e AUSENTE da pesquisa de encerrados → candidato a reabertura
  { id: "b", codigoPedido: "2", encerradoOmieEm: new Date("2026-09-01"), createdAt: new Date("2026-08-01") },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.trava.mockImplementation(async (_p, _j, fn) => fn());
  mockPrisma.pedidoOmie.findMany.mockResolvedValue(PEDIDOS);
  mockPrisma.pedidoOmie.updateMany.mockResolvedValue({ count: 1 });
});

describe("reconciliarEncerramentos — as duas coletas contam", () => {
  it("as duas completas → rodada completa, e marca quem apareceu", async () => {
    mocks.coletar
      .mockResolvedValueOnce(pagina(["1"]))  // encerrados
      .mockResolvedValueOnce(pagina(["2"])); // pendentes: confirma a reabertura do "b"
    const r = await reconciliarEncerramentos(mockPrisma);
    expect(r).toMatchObject({ completa: true, marcados: 1, desmarcados: 1, indefinidos: 0 });
  });

  // ⚠⚠ É ESTE O CASO QUE FALTAVA.
  it("⚠⚠ a 2ª coleta falhando derruba `completa`, mesmo com a 1ª inteira", async () => {
    mocks.coletar
      .mockResolvedValueOnce(pagina(["1"]))
      .mockRejectedValueOnce(new Error("Omie caiu na pesquisa de pendentes"));
    const r = await reconciliarEncerramentos(mockPrisma);
    expect(r.completa).toBe(false);
    expect(r.motivo).toMatch(/pendentes/);
  });

  // ⚠ Sem confirmação, a marca FICA. Ausência nunca foi reabertura.
  it("⚠ a 2ª coleta falhando não desmarca ninguém — vira `indefinidos`", async () => {
    mocks.coletar
      .mockResolvedValueOnce(pagina(["1"]))
      .mockRejectedValueOnce(new Error("Omie caiu"));
    const r = await reconciliarEncerramentos(mockPrisma);
    expect(r.desmarcados).toBe(0);
    expect(r.indefinidos).toBe(1);
  });

  it("sem candidato a reabertura, a 2ª coleta nem acontece e a rodada é completa", async () => {
    mockPrisma.pedidoOmie.findMany.mockResolvedValue([PEDIDOS[0]]);
    mocks.coletar.mockResolvedValueOnce(pagina(["1"]));
    const r = await reconciliarEncerramentos(mockPrisma);
    expect(mocks.coletar).toHaveBeenCalledTimes(1);
    expect(r.completa).toBe(true);
  });
});
