// @vitest-environment jsdom
// "Comprimento Inspecionado" é coluna do modelo do RUS e o PDF sempre a imprimiu — mas nenhuma tela
// pedia o valor, e a coluna saía em branco em todo relatório (verificação do ultrassom, 02/10/2026).
// No computador, ele é pedido em cada indicação, ao lado do comprimento reprovado.
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

const { default: FormUS } = await import("@/app/qualidade/inspecoes/[id]/FormUS");

const REL = { codigo: "RUS-103-004", marcas: ["T103A5"], resultados: {} };

beforeEach(() => { global.fetch = vi.fn(async () => ({ json: async () => ({ soldadores: [] }) })); });
afterEach(() => cleanup());

describe("comprimento inspecionado, no computador", () => {
  it("a indicação tem o campo, e o que se digita vai para a linha em `inspecionado`", () => {
    const setLinhas = vi.fn();
    const linhas = [{ marca: "T103A5", indicacao: "1", laudo: "R", comprimento: "18" }];
    render(<FormUS rel={REL} linhas={linhas} res={{}} travado={false} setLinhas={setLinhas} setResultado={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/^Compr\. inspecionado/), { target: { value: "350" } });
    expect(setLinhas).toHaveBeenCalledWith([{ ...linhas[0], inspecionado: "350" }]);
  });

  it("o comprimento REPROVADO continua no seu campo — os dois não se confundem", () => {
    const linhas = [{ marca: "T103A5", indicacao: "1", laudo: "R", comprimento: "18", inspecionado: "350" }];
    render(<FormUS rel={REL} linhas={linhas} res={{}} travado={false} setLinhas={vi.fn()} setResultado={vi.fn()} />);
    expect(screen.getByLabelText(/^Compr\. inspecionado/).value).toBe("350");
    expect(screen.getByLabelText(/^Compr\. reprovado/).value).toBe("18");
  });

  it("travado, o campo não se edita", () => {
    const linhas = [{ marca: "T103A5", indicacao: "1", laudo: "R", inspecionado: "350" }];
    render(<FormUS rel={REL} linhas={linhas} res={{}} travado setLinhas={vi.fn()} setResultado={vi.fn()} />);
    expect(screen.getByLabelText(/^Compr\. inspecionado/).disabled).toBe(true);
  });
});
