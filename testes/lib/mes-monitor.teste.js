import { describe, it, expect, vi } from "vitest";
import {
  estadoDoCartao, cartaoDoRecurso, panoramaDaFabrica, resumir, LIVRE, DESCONHECIDO, HORAS_SUSPEITAS,
} from "@/lib/mes/monitor";

// O MONITOR DE MÁQUINAS — a tela de cards da supervisão (dataset 131, §6.4).
//
// ⚠⚠ TUDO AQUI É LEITURA. Nenhum teste abre sessão, grava evento ou aponta quantidade: se um dia
// um destes precisar de um mock de escrita, é sinal de que o monitor passou a escrever — e ele não
// pode. Ele fica aberto o dia inteiro numa TV, recarregando sozinho.

const RECURSO = {
  id: "r1", codigo: "SOLDA 5", nome: "Wilson Barros", temTerminal: true,
  setor: { codigo: "SOLDA", nome: "Solda", ordem: 30, cor: null },
};
const SESSAO = {
  id: "s1", recursoId: "r1", abertaEm: new Date("2026-09-13T12:00:00Z"),
  opNumero: "097", marca: "T97A43", operacao: "SOLDA", planejadoQtd: 10,
  operador: { nome: "Jurandir" },
};
const evento = (extra = {}) => ({
  id: "e1", sessaoId: "s1", tipo: "PRODUCAO", ocorridoEm: new Date("2026-09-13T12:30:00Z"),
  detalhe: null, motivo: null, ...extra,
});
const AGORA = new Date("2026-09-13T13:00:00Z");

describe("estadoDoCartao — de onde o evento veio muda o que ele significa", () => {
  it("o evento da sessão aberta é o estado da máquina", () => {
    expect(estadoDoCartao(SESSAO, evento({ tipo: "PARADA", motivo: { descricao: "Falta de material" } }), AGORA))
      .toMatchObject({ estado: "PARADA", detalhe: "Falta de material" });
  });

  // ⚠⚠ O ACHADO DO CODEX (13/09/2026). A primeira versão achatava tudo: sem sessão aberta,
  // QUALQUER evento virava LIVRE — e uma máquina EM MANUTENÇÃO aparecia como disponível para o
  // supervisor mandar trabalho. Evento sem `sessaoId` fala da MÁQUINA (manutenção, sinal do CNC),
  // não do trabalho, e continua valendo com a sessão fechada.
  it("evento do recurso (sem sessão) continua valendo — manutenção não é máquina livre", () => {
    const r = estadoDoCartao(null, evento({ sessaoId: null, tipo: "MANUTENCAO" }), AGORA);
    expect(r.estado).toBe("MANUTENCAO");
  });

  it("o rastro da sessão encerrada deixa a máquina livre", () => {
    expect(estadoDoCartao(null, evento({ tipo: "ENCERRAMENTO" }), AGORA).estado).toBe(LIVRE);
  });

  it("evento de PRODUCAO de uma sessão que já fechou também é livre, não produzindo", () => {
    expect(estadoDoCartao(null, evento({ sessaoId: "s-velha" }), AGORA).estado).toBe(LIVRE);
  });

  // ⚠ Inventar PRODUCAO aqui seria o monitor mentindo com cara de certeza.
  it("evento de outra sessão com uma sessão aberta por cima é dado inconsistente", () => {
    const r = estadoDoCartao(SESSAO, evento({ sessaoId: "s-outra" }), AGORA);
    expect(r).toMatchObject({ estado: DESCONHECIDO, desde: SESSAO.abertaEm });
  });

  // ⚠⚠ Sem evento NÃO é "parado" (§7.3): conectividade é dimensão separada do estado produtivo.
  it("posto que nunca disse nada é SEM REGISTRO, não parado", () => {
    expect(estadoDoCartao(null, null, AGORA)).toMatchObject({ estado: DESCONHECIDO, desde: null });
  });

  it("ENCERRAMENTO nunca aparece como estado — vira livre", () => {
    expect(estadoDoCartao(SESSAO, evento({ tipo: "ENCERRAMENTO" }), AGORA).estado).toBe(LIVRE);
  });
});

describe("o alerta de sessão esquecida", () => {
  const velha = { ...SESSAO, abertaEm: new Date("2026-09-12T18:00:00Z") };   // 19 h antes

  it("acusa sessão produtiva aberta desde ontem", () => {
    expect(estadoDoCartao(velha, evento(), AGORA).alerta).toMatch(/19 h/);
  });

  it("não acusa sessão dentro do turno", () => {
    expect(estadoDoCartao(SESSAO, evento(), AGORA).alerta).toBeUndefined();
  });

  // ⚠ Máquina PARADA há 19 h é problema de outra natureza (e a parada tem motivo escrito). O
  // alerta existe para "diz produzindo e não tem ninguém lá".
  it("não acusa máquina parada, por mais velha que seja a sessão", () => {
    expect(estadoDoCartao(velha, evento({ tipo: "PARADA" }), AGORA).alerta).toBeUndefined();
  });

  it("o corte é de 12 h, exatamente como está escrito", () => {
    const corte = { ...SESSAO, abertaEm: new Date(AGORA.getTime() - HORAS_SUSPEITAS * 3_600_000) };
    expect(estadoDoCartao(corte, evento(), AGORA).alerta).toBeTruthy();
  });
});

describe("cartaoDoRecurso", () => {
  it("leva o trabalho da sessão e as quantidades", () => {
    const c = cartaoDoRecurso(RECURSO, {
      sessoes: [{ ...SESSAO, pecaId: "p1" }], evento: evento(),
      somas: new Map([["s1", { boas: 4, rejeitadas: 1, retrabalho: 2 }]]),
      pecas: new Map([["p1", { descricao: "COLUNA" }]]),
    }, AGORA);
    expect(c).toMatchObject({
      codigo: "SOLDA 5", nome: "Wilson Barros", estado: "PRODUCAO", operador: "Jurandir",
      obra: "097", marca: "T97A43", operacao: "SOLDA", descricao: "COLUNA",
      planejado: 10, produzido: 4, rejeitado: 1, retrabalho: 2,
    });
  });

  // ⚠⚠ ACHADO DO CODEX: o monitor enxerga UMA sessão, `saldoDaMarca` soma TODAS as da obra+marca.
  // Numa marca de 10 com 6 feitas ontem e 2 hoje, o monitor diria "faltam 8" e o totem "faltam 2".
  // Duas verdades sobre o mesmo número, e o chão acreditaria na que estivesse mais perto.
  it("NÃO manda saldo — ele divergiria do totem", () => {
    const c = cartaoDoRecurso(RECURSO, { sessoes: [SESSAO], evento: evento() }, AGORA);
    expect(c.saldo).toBeUndefined();
  });

  it("posto sem sessão não inventa obra nem operador", () => {
    const c = cartaoDoRecurso(RECURSO, { sessoes: [], evento: evento({ tipo: "ENCERRAMENTO", sessaoId: "s-velha" }) }, AGORA);
    expect(c).toMatchObject({ estado: LIVRE, operador: null, obra: null, marca: null, planejado: 0, produzido: 0 });
  });
});

// ─── VÁRIAS MARCAS ABERTAS NO MESMO POSTO (13/09/2026) ───────────────────────
//
// ⚠⚠ Matheus: "tem que ser possível multi marcas ao mesmo tempo numa máquina". O monitor via UMA
// sessão por posto; com o lote do nesting, vê várias — e continua tendo de mostrar UM card.

describe("o posto com várias marcas abertas", () => {
  const outra = { ...SESSAO, id: "s2", marca: "T97A44", abertaEm: new Date("2026-09-13T12:10:00Z") };

  it("mostra um card só, com o trabalho principal e quantas marcas mais", () => {
    const c = cartaoDoRecurso(RECURSO, { sessoes: [SESSAO, outra], evento: evento() }, AGORA);
    expect(c).toMatchObject({ marca: "T97A43", trabalhos: 2, outrasMarcas: ["T97A44"] });
  });

  // ⚠⚠ O EVENTO DO LOTE NÃO TEM SESSÃO (`sessaoId: null`) — é do RECURSO. Se o monitor só aceitasse
  // evento de sessão, a máquina com o lote aberto apareceria SEM REGISTRO.
  it("o evento do lote (do recurso) vale para todas as marcas", () => {
    const r = estadoDoCartao([SESSAO, outra], evento({ sessaoId: null, tipo: "PRODUCAO" }), AGORA);
    expect(r.estado).toBe("PRODUCAO");
  });

  it("evento de QUALQUER uma das abertas vale", () => {
    expect(estadoDoCartao([SESSAO, outra], evento({ sessaoId: "s2" }), AGORA).estado).toBe("PRODUCAO");
  });

  // ⚠ O alerta de sessão esquecida olha a MAIS VELHA: é ela que denuncia o turno que foi embora.
  it("o alerta olha a marca aberta há mais tempo", () => {
    const velha = { ...SESSAO, id: "s0", abertaEm: new Date("2026-09-12T18:00:00Z") };
    const r = estadoDoCartao([outra, velha], evento({ sessaoId: "s2" }), AGORA);
    expect(r.alerta).toMatch(/19 h/);
  });
});

describe("resumir — parado, livre e sem registro são três coisas diferentes", () => {
  // ⚠ Somar os três em "não produzindo" é o número que o Syneco entrega hoje e que não serve para
  // agir: parada é problema para resolver agora, livre é máquina esperando trabalho, sem registro
  // é posto que ninguém sabe.
  it("conta cada um no seu balde", () => {
    const r = resumir([
      { estado: "PRODUCAO" }, { estado: "PRODUCAO" }, { estado: "PARADA" },
      { estado: "SETUP" }, { estado: LIVRE }, { estado: DESCONHECIDO }, { estado: "PRODUCAO", alerta: "x" },
    ]);
    expect(r).toEqual({ total: 7, produzindo: 3, parado: 1, setup: 1, livre: 1, semRegistro: 1, alertas: 1 });
  });
});

function prismaFalso({ recursos = [], sessoes = [], somas = [], pecas = [] } = {}) {
  return {
    mesRecurso: { findMany: vi.fn().mockResolvedValue(recursos) },
    mesSessao: { findMany: vi.fn().mockResolvedValue(sessoes) },
    mesApontamentoQtd: { groupBy: vi.fn().mockResolvedValue(somas) },
    pecaConjunto: { findMany: vi.fn().mockResolvedValue(pecas) },
  };
}

describe("panoramaDaFabrica", () => {
  it("agrupa por setor e resume", async () => {
    const prisma = prismaFalso({
      recursos: [
        { ...RECURSO, eventos: [evento()] },
        { id: "r2", codigo: "SOLDA 6", nome: "Ari", temTerminal: true, setor: RECURSO.setor, eventos: [] },
        { id: "r3", codigo: "LASER_CHAPA", nome: "Laser Chapa", temTerminal: true,
          setor: { codigo: "PREPARACAO", nome: "Preparação", ordem: 10 }, eventos: [] },
      ],
      sessoes: [{ ...SESSAO, pecaId: "p1" }],
      somas: [{ sessaoId: "s1", _sum: { boas: 4, rejeitadas: 0, retrabalho: 0 } }],
      pecas: [{ id: "p1", descricao: "COLUNA" }],
    });
    const r = await panoramaDaFabrica(prisma, { agora: AGORA });

    expect(r.setores.map((s) => s.codigo)).toEqual(["SOLDA", "PREPARACAO"]);
    expect(r.setores[0].postos).toHaveLength(2);
    expect(r.setores[0].postos[0]).toMatchObject({ estado: "PRODUCAO", produzido: 4, descricao: "COLUNA" });
    expect(r.resumo).toMatchObject({ total: 3, produzindo: 1, semRegistro: 2 });
  });

  // ⚠ Fábrica vazia (cadastro novo) não pode estourar nem sair consultando sessão de coisa nenhuma.
  it("sem recurso cadastrado, devolve vazio sem ir atrás de sessões", async () => {
    const prisma = prismaFalso();
    const r = await panoramaDaFabrica(prisma);
    expect(r.setores).toEqual([]);
    expect(prisma.mesSessao.findMany).not.toHaveBeenCalled();
  });

  // ⚠⚠ O último evento vem JUNTO com o recurso (`take: 1` na relação) e com ordem TOTAL. Sem o
  // desempate, dois eventos no mesmo milissegundo fariam o card piscar entre dois estados.
  it("pede o último evento com desempate estável", async () => {
    const prisma = prismaFalso({ recursos: [{ ...RECURSO, eventos: [] }] });
    await panoramaDaFabrica(prisma);
    const { eventos } = prisma.mesRecurso.findMany.mock.calls[0][0].include;
    expect(eventos.take).toBe(1);
    expect(eventos.orderBy).toEqual([{ ocorridoEm: "desc" }, { recebidoEm: "desc" }, { id: "desc" }]);
  });

  it("só olha posto ativo — desativado não ocupa espaço na TV", async () => {
    const prisma = prismaFalso({ recursos: [{ ...RECURSO, eventos: [] }] });
    await panoramaDaFabrica(prisma);
    expect(prisma.mesRecurso.findMany.mock.calls[0][0].where.ativo).toBe(true);
  });
});
