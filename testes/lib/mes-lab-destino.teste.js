import { describe, it, expect } from "vitest";
import { exigirLaboratorio, exigirOrigem } from "@/scripts/mes-lab/destino.mjs";

// ⚠⚠ ESTE TESTE GUARDA UMA PORTA QUE SÓ ERRA UMA VEZ. O importador do laboratório LÊ de produção e
// ESCREVE no banco local. Se o destino algum dia resolver para o Neon, o script despeja dado de
// demonstração — com nome real de operador — dentro da operação, e não existe desfazer barato.
//
// A trava é a única coisa entre esses dois bancos, e ela é código puro: dá para provar aqui, sem
// banco nenhum, exatamente o que ela aceita e o que ela recusa. É o teste mais barato do projeto e
// o que cobre o pior acidente possível deste script.
//
// ⚠ O caso perigoso NÃO é esquecer a variável — é preenchê-la com a URL errada, copiada do
// `.env.local`. Por isso o segundo bloco existe: a URL do Neon é sintaticamente perfeita, e só a
// checagem de host a separa de um desastre.

const NEON = "postgresql://u:p@ep-cold-hill-acrnaqw9-pooler.sa-east-1.aws.neon.tech/portal";
const LOCAL = "postgresql://torg:torg@localhost:55432/torg_mes_lab";

describe("exigirLaboratorio — o destino tem que ser esta máquina", () => {
  it("aceita localhost", () => {
    expect(exigirLaboratorio(LOCAL)).toBe(LOCAL);
  });

  it("aceita 127.0.0.1 e ::1 — são a mesma máquina por outro nome", () => {
    for (const host of ["127.0.0.1", "[::1]"]) {
      const url = `postgresql://torg:torg@${host}:55432/torg_mes_lab`;
      expect(exigirLaboratorio(url)).toBe(url);
    }
  });

  it("RECUSA o Neon de produção, e diz qual host recusou", () => {
    expect(() => exigirLaboratorio(NEON)).toThrow(/neon\.tech/);
  });

  it("recusa qualquer host remoto, não só o Neon", () => {
    expect(() => exigirLaboratorio("postgresql://u:p@10.0.0.5:5432/x")).toThrow(/não é esta máquina/);
  });

  it("recusa variável ausente em vez de cair no padrão — esquecer não pode gravar em lugar nenhum", () => {
    for (const vazio of [undefined, "", null]) {
      expect(() => exigirLaboratorio(vazio)).toThrow(/MES_LAB_URL não está definida/);
    }
  });

  it("recusa lixo que não é URL, sem estourar rastro de pilha", () => {
    expect(() => exigirLaboratorio("banco-do-matheus")).toThrow(/não é uma URL válida/);
  });
});

describe("exigirOrigem — a origem é produção, e é obrigatória", () => {
  it("devolve a URL quando existe", () => {
    expect(exigirOrigem(NEON)).toBe(NEON);
  });

  // ⚠ A origem NÃO é validada por host, e isso é decisão: ela é legitimamente remota (o Neon), e
  // um laboratório importando de outro laboratório também é uso válido. O que ela não pode é
  // faltar em silêncio.
  it("recusa origem ausente", () => {
    expect(() => exigirOrigem(undefined)).toThrow(/DATABASE_URL não está definida/);
  });
});
