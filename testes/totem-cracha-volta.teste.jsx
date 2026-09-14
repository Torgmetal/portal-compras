// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import PedirCracha from "@/app/mes-lab/totem/[codigo]/PedirCracha";

// A VOLTA AUTOMÁTICA DA TELA DO CRACHÁ.
//
// Matheus (11/09/2026): "se o operador não colocar o crachá em 10s fecha a tela e volta para as
// bancadas". O totem fica aberto o turno inteiro — sem isso, quem abriu um posto por engano deixa a
// tela presa nele, e o próximo encontra o posto errado esperando por ele.

const empurrar = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: empurrar }) }));

const BANCADAS = "/mes-lab/totem/setor/MONTAGEM";

beforeEach(() => { vi.useFakeTimers(); empurrar.mockClear(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

const correr = (segundos) => act(() => { vi.advanceTimersByTime(segundos * 1000); });

describe("PedirCracha — volta para as bancadas sozinho", () => {
  it("volta depois de 10 segundos parado", () => {
    render(<PedirCracha aoEnviar={vi.fn()} ocupado={false} voltarPara={BANCADAS} />);
    correr(9);
    expect(empurrar).not.toHaveBeenCalled();
    correr(1);
    expect(empurrar).toHaveBeenCalledWith(BANCADAS);
  });

  // ⚠⚠ ESTE É O TESTE QUE IMPORTA. Sem zerar o relógio a cada tecla, quem digita a matrícula à mão
  // (leitor com defeito, crachá desmagnetizado) é jogado para fora NO MEIO da digitação — e a tela
  // que deveria proteger o posto vira a que impede de trabalhar.
  it("zera a contagem a cada tecla digitada", () => {
    render(<PedirCracha aoEnviar={vi.fn()} ocupado={false} voltarPara={BANCADAS} />);
    const campo = screen.getByPlaceholderText("• • • •");

    correr(8);
    fireEvent.change(campo, { target: { value: "2" } });
    correr(8);
    fireEvent.change(campo, { target: { value: "24" } });
    correr(8);
    expect(empurrar).not.toHaveBeenCalled();  // 24 segundos na tela, e ninguém foi expulso

    correr(2);
    expect(empurrar).toHaveBeenCalledWith(BANCADAS);
  });

  // ⚠ Totem preso a um posto cujo setor sumiu do cadastro ficaria navegando para lugar nenhum a
  // cada 10 segundos.
  it("sem destino, não vai a lugar nenhum", () => {
    render(<PedirCracha aoEnviar={vi.fn()} ocupado={false} voltarPara={null} />);
    correr(30);
    expect(empurrar).not.toHaveBeenCalled();
  });

  // ⚠ Enquanto o crachá está sendo conferido no servidor, o relógio não corre: expulsar a tela no
  // meio da resposta perderia um login que estava dando certo.
  it("não conta enquanto o servidor está respondendo", () => {
    render(<PedirCracha aoEnviar={vi.fn()} ocupado voltarPara={BANCADAS} />);
    correr(30);
    expect(empurrar).not.toHaveBeenCalled();
  });

  // ⚠ Tela que salta sozinha, sem aviso, se parece com defeito — e o operador tenta de novo achando
  // que travou.
  it("avisa nos últimos segundos, e não antes", () => {
    render(<PedirCracha aoEnviar={vi.fn()} ocupado={false} voltarPara={BANCADAS} />);
    correr(4);
    expect(screen.queryByText(/Voltando para as bancadas/i)).toBeNull();
    correr(2);
    expect(screen.getByText(/Voltando para as bancadas em \d/i)).toBeTruthy();
  });

  it("bipar manda o crachá sem espaços e limpa o campo", () => {
    const aoEnviar = vi.fn();
    render(<PedirCracha aoEnviar={aoEnviar} ocupado={false} voltarPara={BANCADAS} />);
    const campo = screen.getByPlaceholderText("• • • •");
    fireEvent.change(campo, { target: { value: " 240135 " } });
    fireEvent.submit(campo.closest("form"));
    expect(aoEnviar).toHaveBeenCalledWith("240135");
    expect(campo.value).toBe("");
  });
});

// ⚠⚠ O BOTÃO "VOLTAR" (Matheus, 13/09/2026). A volta automática já existia, mas obrigava a esperar
// dez segundos parado olhando para a tela errada — e quem chega ao totem errado sabe disso no
// primeiro olhar.
describe("PedirCracha — o botão Voltar", () => {
  it("leva para as bancadas na hora, sem esperar a contagem", () => {
    render(<PedirCracha aoEnviar={vi.fn()} ocupado={false} voltarPara={BANCADAS} />);
    fireEvent.click(screen.getByText(/Voltar para as bancadas/i));
    expect(empurrar).toHaveBeenCalledWith(BANCADAS);
  });

  // ⚠ Sem destino não há volta: totem preso a um posto de um setor que sumiu do cadastro não pode
  // oferecer um botão que navega para lugar nenhum.
  it("sem destino, o botão não aparece", () => {
    render(<PedirCracha aoEnviar={vi.fn()} ocupado={false} voltarPara={null} />);
    expect(screen.queryByText(/Voltar para as bancadas/i)).toBeNull();
  });

  // ⚠⚠ VOLTAR É NAVEGAÇÃO, NÃO É SAIR DO POSTO (pedido do Codex). Nesta tela ninguém está
  // identificado, então não há vínculo de crachá a liberar — e uma operação aberta jamais pode ser
  // solta por um gesto de navegação. Quem libera o crachá é o "Sair", com o operador na tela.
  it("não dispara nenhuma ação no servidor", () => {
    const aoEnviar = vi.fn();
    render(<PedirCracha aoEnviar={aoEnviar} ocupado={false} voltarPara={BANCADAS} />);
    fireEvent.click(screen.getByText(/Voltar para as bancadas/i));
    expect(aoEnviar).not.toHaveBeenCalled();
  });
});
