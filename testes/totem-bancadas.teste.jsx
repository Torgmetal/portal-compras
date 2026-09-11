// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import Bancada from "@/app/mes-lab/totem/setor/[codigo]/Bancada";

// O CARD DA BANCADA, NA TELA DO SETOR.
//
// Matheus (11/09/2026): "deixe com visual mais bonito as bancadas e escritas grandes". O que dá para
// provar aqui não é beleza — é o que a beleza servia: o nome grande existir, o alvo de toque levar
// ao posto certo, e o card dizer a coisa certa em cada situação.

vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }) => <a href={href} {...resto}>{children}</a>,
}));

const RECURSO = { id: "r1", codigo: "MONTAGEM 1", nome: "Jurandir" };

afterEach(cleanup);

describe("Bancada — livre", () => {
  it("diz Livre e não carimba selo de estado", () => {
    render(<Bancada recurso={RECURSO} cor="#006EAB" sessao={null} estado={null} />);
    expect(screen.getByText("Livre")).toBeTruthy();
    // ⚠⚠ ERA ESTE O DEFEITO DA PRIMEIRA VERSÃO: "SEM REGISTRO" carimbado em TODAS as bancadas —
    // quatro de cinco com a mesma etiqueta cinza, que não muda decisão nenhuma de quem vai escolher
    // onde trabalhar, e só ensina a ignorar etiqueta.
    expect(screen.queryByText(/SEM REGISTRO/i)).toBeNull();
  });

  it("o card inteiro leva ao posto, com o código escapado na URL", () => {
    render(<Bancada recurso={RECURSO} cor="#006EAB" sessao={null} estado={null} />);
    // ⚠ O código tem ESPAÇO ("MONTAGEM 1"): sem escapar, o link quebra no navegador.
    expect(screen.getByRole("link").getAttribute("href")).toBe("/mes-lab/totem/MONTAGEM%201");
  });
});

describe("Bancada — em uso", () => {
  const SESSAO = { marca: "T97A43", opNumero: "097", operadorId: "o1" };

  it("mostra quem está nela, a marca e a obra", () => {
    render(<Bancada recurso={RECURSO} cor="#006EAB" sessao={SESSAO} estado="PRODUCAO" operador="Alex" />);
    expect(screen.getByText("Alex")).toBeTruthy();
    expect(screen.getByText(/T97A43/)).toBeTruthy();
    expect(screen.getByText(/obra 097/)).toBeTruthy();
    expect(screen.queryByText("Livre")).toBeNull();
  });

  // ⚠ A bancada tem nome de pessoa (o montador titular), mas quem está nela pode ser outro. Sem
  // mostrar o operador da sessão, o card afirmaria que o titular está lá quando não está.
  it("o nome do operador é o da sessão, não o da bancada", () => {
    render(<Bancada recurso={RECURSO} cor="#006EAB" sessao={SESSAO} estado="PRODUCAO" operador="Alex" />);
    expect(screen.getByText("Jurandir")).toBeTruthy();  // a bancada
    expect(screen.getByText("Alex")).toBeTruthy();      // quem está nela agora
  });

  it("carimba o estado com a palavra, não só com a cor", () => {
    render(<Bancada recurso={RECURSO} cor="#006EAB" sessao={SESSAO} estado="PARADA" operador="Alex" />);
    expect(screen.getByText("PARADO")).toBeTruthy();
  });

  // ⚠ Sessão aberta antes de a marca ser escolhida existe: o card não pode ficar com um buraco.
  it("sessão sem marca não deixa buraco no card", () => {
    render(<Bancada recurso={RECURSO} cor="#006EAB" sessao={{ operadorId: "o1" }} estado="SETUP" operador="Alex" />);
    expect(screen.getByText("sem marca")).toBeTruthy();
  });

  it("sem o nome do operador, ainda diz que está em uso", () => {
    render(<Bancada recurso={RECURSO} cor="#006EAB" sessao={SESSAO} estado="PRODUCAO" operador={undefined} />);
    expect(screen.getByText("em uso")).toBeTruthy();
  });
});
