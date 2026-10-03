// @vitest-environment jsdom
// Matheus (03/10/2026): "onde mostra a coluna CROQUIS e tem 0/6 falta é interessante poder clicar em
// cima e ver quais são essas 6 que faltam e suas quantidades". A lista estava só no `title` do chip
// — que no celular, onde os gerentes de setor olham, não existe (não há passar o mouse).
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { CroquisChip, CroquisFaltando } from "@/app/pcp/producao/CroquisConjunto";

afterEach(cleanup);

const FALTAM = [
  { marca: "T124A1-P1", descricao: "PL 12.5x200", faltaQtd: 2, qtd: 4 },
  { marca: "T124A1-P2", descricao: null, faltaQtd: 1, qtd: 1 },
];

describe("CroquisChip", () => {
  it("é um BOTÃO quando falta croqui, e diz quantos", () => {
    const onAlternar = vi.fn();
    render(<CroquisChip peca={{ totalCroquis: 6, faltamCroquis: FALTAM, prontoMontar: false }} aberto={false} onAlternar={onAlternar} />);
    const b = screen.getByRole("button", { name: /4\/6 · faltam 2/ });
    expect(b.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(b);
    expect(onAlternar).toHaveBeenCalled();
  });

  it("pronto não abre nada — é só o chip verde", () => {
    render(<CroquisChip peca={{ totalCroquis: 3, faltamCroquis: [], prontoMontar: true }} aberto={false} onAlternar={() => {}} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/3\/3 pronto/)).toBeTruthy();
  });

  it("sem croquis vinculados: traço", () => {
    const { container } = render(<CroquisChip peca={{ totalCroquis: 0 }} aberto={false} onAlternar={() => {}} />);
    expect(container.textContent).toBe("—");
  });
});

describe("CroquisFaltando", () => {
  it("lista cada croqui que falta, com a descrição e 'faltam X de Y'", () => {
    const { container } = render(<CroquisFaltando faltam={FALTAM} />);
    expect(container.textContent).toMatch(/Faltam cortar \(2\)/);
    expect(container.textContent).toMatch(/T124A1-P1/);
    expect(container.textContent).toMatch(/PL 12\.5x200/);
    expect(container.textContent).toMatch(/faltam 2 de 4/);
    expect(container.textContent).toMatch(/T124A1-P2/);
  });

  it("sem a quantidade total (dado antigo), diz só quanto falta", () => {
    const { container } = render(<CroquisFaltando faltam={[{ marca: "X", faltaQtd: 3 }]} />);
    expect(container.textContent).toMatch(/faltam 3$/);
  });
});
