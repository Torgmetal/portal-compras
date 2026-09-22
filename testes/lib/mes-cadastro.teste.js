import { describe, it, expect, vi } from "vitest";
import {
  normalizarCodigo, recusaDoCadastro, recusaDaExclusao, recusaDaTrocaDeCodigo, setoresSemPosto,
  usosDoCadastro, excluirSeLivre, normalizarNome,
} from "@/lib/mes/cadastro";

// O CADASTRO DA FÁBRICA — as recusas que impedem cadastro sem sentido de nascer.
//
// Matheus: "precisamos ter essas telas depois para criar e excluir setores, máquinas dos
// setores/bancadas". Aqui ficam as regras; a rota e a tela só as chamam.

describe("normalizarCodigo", () => {
  it("apara e sobe a caixa", () => {
    expect(normalizarCodigo("  laser_chapa ")).toBe("LASER_CHAPA");
  });

  // ⚠⚠ O ESPAÇO DO MEIO FICA. Os códigos do Gantt são "SOLDA 5", "MONTAGEM 1" — com espaço, e é
  // essa string que já está gravada em 21.772 peças. Tirando o espaço, a bancada nunca casaria com
  // a programação e simplesmente não receberia trabalho.
  it("mantém o espaço do meio, que faz parte do código do Gantt", () => {
    expect(normalizarCodigo(" solda  5 ")).toBe("SOLDA 5");
    expect(normalizarCodigo("montagem 1")).toBe("MONTAGEM 1");
  });

  it("vazio continua vazio, sem virar string estranha", () => {
    expect(normalizarCodigo(null)).toBe("");
    expect(normalizarCodigo("   ")).toBe("");
  });
});

describe("recusaDoCadastro", () => {
  it("aceita um setor completo", () => {
    expect(recusaDoCadastro("setores", { codigo: "SOLDA", nome: "Solda", ordem: 40 })).toBeNull();
  });

  // ⚠ A ordem é a CADEIA FÍSICA (10, 20, 30…) — é ela que põe Preparação antes de Montagem em toda
  // tela. Sem número, o setor novo apareceria em lugar arbitrário da fila.
  it("recusa setor sem ordem, e sem ordem numérica", () => {
    expect(recusaDoCadastro("setores", { codigo: "X", nome: "X" })).toMatch(/ordem/i);
    expect(recusaDoCadastro("setores", { codigo: "X", nome: "X", ordem: "primeiro" })).toMatch(/número/i);
  });

  it("ordem zero é válida — é número, não é ausência", () => {
    expect(recusaDoCadastro("setores", { codigo: "X", nome: "X", ordem: 0 })).toBeNull();
  });

  it("recusa recurso sem setor e com tipo inventado", () => {
    expect(recusaDoCadastro("recursos", { codigo: "SOLDA 8", nome: "Nova" })).toMatch(/setor/i);
    expect(recusaDoCadastro("recursos", { codigo: "SOLDA 8", nome: "N", setorId: "s1", tipo: "MESA" }))
      .toMatch(/MAQUINA/);
  });

  it("aceita recurso sem tipo — o padrão é MAQUINA", () => {
    expect(recusaDoCadastro("recursos", { codigo: "SOLDA 8", nome: "Nova", setorId: "s1" })).toBeNull();
  });

  // ⚠⚠ Sem crachá o operador existe no cadastro e não entra em terminal nenhum — um cadastro que
  // parece completo e não serve para nada.
  it("recusa operador sem crachá", () => {
    expect(recusaDoCadastro("operadores", { nome: "Alex" })).toMatch(/crachá/i);
  });

  it("recusa entidade que não existe, em vez de gravar em lugar nenhum", () => {
    expect(recusaDoCadastro("turnos", { codigo: "A" })).toMatch(/desconhecido/i);
  });
});

describe("recusaDaExclusao — o que tem histórico não se apaga", () => {
  it("deixa apagar o que nunca foi usado", () => {
    expect(recusaDaExclusao(0, "apontamentos")).toBeNull();
  });

  // ⚠⚠ Apagar um recurso com apontamento levaria junto (ou deixaria órfão) o evento que prova quem
  // produziu o quê — e o relatório do mês passado passaria a mentir.
  it("recusa apagar o que tem histórico, e manda desativar", () => {
    const r = recusaDaExclusao(37, "apontamentos");
    expect(r).toMatch(/37/);
    expect(r).toMatch(/desative/i);
  });
});

describe("recusaDaTrocaDeCodigo — o código congela no primeiro uso", () => {
  it("deixa corrigir o código enquanto nada foi usado", () => {
    expect(recusaDaTrocaDeCodigo("SOLDA 8", "SOLDA 9", 0)).toBeNull();
  });

  // ⚠⚠ FALHA SILENCIOSA: trocado, a bancada continua na tela, bonita, e para de receber a
  // programação do PCP — porque o vínculo é o código ("SOLDA 5" em `PecaConjunto.soldaBancada`).
  it("recusa trocar o código de quem já tem histórico", () => {
    expect(recusaDaTrocaDeCodigo("SOLDA 5", "SOLDA 50", 12)).toMatch(/não pode mudar/i);
  });

  it("mandar o mesmo código não é troca, mesmo com histórico", () => {
    expect(recusaDaTrocaDeCodigo("SOLDA 5", " solda 5 ", 12)).toBeNull();
  });

  it("não mandar código nenhum não é troca", () => {
    expect(recusaDaTrocaDeCodigo("SOLDA 5", undefined, 12)).toBeNull();
  });
});

describe("setoresSemPosto — o trabalho que não apareceria em terminal nenhum", () => {
  const PROGRAMADOS = ["PREPARACAO", "MONTAGEM", "SOLDA", "ACABAMENTO"];

  it("acusa o setor programado que não tem posto ativo", () => {
    const r = setoresSemPosto(PROGRAMADOS, [
      { setor: { codigo: "PREPARACAO" }, ativo: true },
      { setor: { codigo: "MONTAGEM" }, ativo: true },
      { setor: { codigo: "SOLDA" }, ativo: true },
    ]);
    expect(r).toEqual(["ACABAMENTO"]);
  });

  // ⚠ Posto desativado não cobre o setor: ele saiu de uso, e o trabalho continua sem terminal.
  it("posto desativado não conta como cobertura", () => {
    expect(setoresSemPosto(["JATO"], [{ setor: { codigo: "JATO" }, ativo: false }])).toEqual(["JATO"]);
  });

  // ⚠⚠ O QUE ESTA FUNÇÃO DELIBERADAMENTE NÃO ACUSA: granularidade diferente. No Acabamento o Gantt
  // planeja em balde ("ACABAMENTO") e o MES tem ACABAMENTO01…10 — `programadoPara` cai para o setor
  // e o trabalho aparece. Acusar isso seria alarme falso, e alarme falso ensina a ignorar a tarja.
  it("não acusa posto físico mais fino que o balde do Gantt", () => {
    const r = setoresSemPosto(["ACABAMENTO"], [
      { setor: { codigo: "ACABAMENTO" }, ativo: true },   // ACABAMENTO05, por exemplo
    ]);
    expect(r).toEqual([]);
  });

  it("sem nada, não inventa aviso", () => {
    expect(setoresSemPosto()).toEqual([]);
  });
});

describe("usosDoCadastro — o que segura um cadastro", () => {
  // ⚠⚠ FALTAVAM TRÊS RELAÇÕES, E A CONTA ERRADA NÃO DAVA RECUSA: DAVA ERRO DE BANCO (achado do
  // Codex sobre o semeador, 22/09/2026 — a TELA tinha o mesmo buraco). `MesRecurso` também é
  // apontado por presença, dispositivo e reserva de barra, e nenhuma dessas FKs tem cascade.
  const contador = (valores) => ({
    mesRecurso: { count: vi.fn(async () => valores.recursos ?? 0) },
    mesEvento: { count: vi.fn(async () => valores.eventos ?? 0) },
    mesSessao: { count: vi.fn(async () => valores.sessoes ?? 0) },
    mesPresenca: { count: vi.fn(async () => valores.presencas ?? 0) },
    mesDispositivo: { count: vi.fn(async () => valores.dispositivos ?? 0) },
    mesUnidadeReserva: { count: vi.fn(async () => valores.reservas ?? 0) },
  });

  it("posto sem nada é removível", async () => {
    expect(await usosDoCadastro(contador({}), "recursos", "r1")).toBe(0);
  });

  // ⚠⚠ O CASO QUE ESTOURAVA: alguém só bipou o crachá no posto, sem nenhum apontamento. Ele passava
  // por "nunca usado" e o `delete` batia na chave estrangeira — o operador via erro de banco no
  // lugar da frase que explica o que fazer.
  it.each(["presencas", "dispositivos", "reservas"])(
    "posto com %s e nenhum apontamento NÃO é removível", async (relacao) => {
      const usos = await usosDoCadastro(contador({ [relacao]: 1 }), "recursos", "r1");
      expect(usos).toBe(1);
      expect(recusaDaExclusao(usos, "registro(s) ligado(s) a ele")).toMatch(/Desative/);
    });

  it("soma todas as relações do posto", async () => {
    const usos = await usosDoCadastro(
      contador({ eventos: 2, sessoes: 3, presencas: 1, dispositivos: 1, reservas: 4 }), "recursos", "r1");
    expect(usos).toBe(11);
  });

  // ⚠ O operador também tem presença, e ela também segura — mesmo motivo.
  it("operador com presença e nenhum apontamento NÃO é removível", async () => {
    expect(await usosDoCadastro(contador({ presencas: 1 }), "operadores", "o1")).toBe(1);
  });

  it("setor é segurado pelos postos dentro dele", async () => {
    expect(await usosDoCadastro(contador({ recursos: 5 }), "setores", "s1")).toBe(5);
  });
});

describe("excluirSeLivre — contar e apagar são dois momentos", () => {
  const zerado = {
    mesRecurso: { count: vi.fn(async () => 0) }, mesEvento: { count: vi.fn(async () => 0) },
    mesSessao: { count: vi.fn(async () => 0) }, mesPresenca: { count: vi.fn(async () => 0) },
    mesDispositivo: { count: vi.fn(async () => 0) }, mesUnidadeReserva: { count: vi.fn(async () => 0) },
  };
  const P2003 = () => Object.assign(new Error("Foreign key constraint failed"), { code: "P2003" });

  it("apaga o que ninguém segura", async () => {
    const apagar = vi.fn(async () => {});
    expect(await excluirSeLivre(zerado, "recursos", "r1", { nomeDoUso: "x", apagar })).toEqual({ excluido: true });
    expect(apagar).toHaveBeenCalled();
  });

  it("nem tenta apagar o que já tem histórico", async () => {
    const comUso = { ...zerado, mesSessao: { count: vi.fn(async () => 3) } };
    const apagar = vi.fn(async () => {});
    const r = await excluirSeLivre(comUso, "recursos", "r1", { nomeDoUso: "apontamentos", apagar });
    expect(r.recusa).toMatch(/Desative/);
    expect(apagar).not.toHaveBeenCalled();
  });

  // ⚠⚠ A CORRIDA: o filtro não enxerga inserção ainda não confirmada. Se ela confirmar enquanto o
  // delete espera, o Postgres recusa por chave estrangeira — e isso é RECUSA, não exceção. No
  // script, subindo como erro, derrubava a execução antes de semear os crachás.
  it("alguém passou a usar entre a contagem e o delete: recusa, não exceção", async () => {
    const apagar = vi.fn(async () => { throw P2003(); });
    const r = await excluirSeLivre(zerado, "recursos", "r1", { nomeDoUso: "x", apagar });
    expect(r.recusa).toMatch(/agora mesmo/i);
    expect(r.excluido).toBeUndefined();
  });

  // ⚠ Só o P2003 vira recusa. Engolir o resto transformaria defeito em "não deu para excluir".
  it("qualquer outro erro SOBE", async () => {
    const apagar = vi.fn(async () => { throw Object.assign(new Error("timeout"), { code: "P1008" }); });
    await expect(excluirSeLivre(zerado, "recursos", "r1", { nomeDoUso: "x", apagar })).rejects.toThrow(/timeout/);
  });

  // ⚠ Um posto preso não pode derrubar a remoção dos outros — é o que o laço do script espera.
  it("a recusa de um não impede o próximo", async () => {
    const presos = ["a", "b", "c"];
    const resultados = [];
    for (const id of presos) {
      const apagar = vi.fn(async () => { if (id === "b") throw P2003(); });
      resultados.push(await excluirSeLivre(zerado, "recursos", id, { nomeDoUso: "x", apagar }));
    }
    expect(resultados.map((r) => Boolean(r.excluido))).toEqual([true, false, true]);
  });
});

describe("normalizarNome — o cadastro do MES é em maiúscula", () => {
  // Matheus (22/09/2026): "deixei tudo em letra maiúscula por padrão os cadastros".
  it("sobe a caixa", () => {
    expect(normalizarNome("Laser Chapa")).toBe("LASER CHAPA");
  });

  // ⚠ O ACENTO FICA. Tirá-lo mudaria o nome da coisa, não a caixa dela — e "GALPAO" não é como a
  // fábrica escreve.
  it("preserva o acento", () => {
    expect(normalizarNome("Galpão 1")).toBe("GALPÃO 1");
    expect(normalizarNome("Édecio Viana")).toBe("ÉDECIO VIANA");
  });

  // ⚠⚠ ISTO PEGOU UM NOME DE VERDADE: o RH tinha "   ALEX APARECIDO ORSI", com espaços na frente,
  // e a lista do totem ordena por nome — o espaço o jogava para o topo.
  it("apara as pontas e junta o espaço repetido", () => {
    expect(normalizarNome("   ALEX   APARECIDO ORSI ")).toBe("ALEX APARECIDO ORSI");
  });

  it("aguenta nulo sem quebrar", () => {
    expect(normalizarNome(null)).toBe("");
  });
});
