import { describe, it, expect, vi } from "vitest";
import {
  normalizarCodigo, recusaDoCadastro, recusaDaExclusao, recusaDaTrocaDeCodigo, setoresSemPosto,
  usosDoCadastro,
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
