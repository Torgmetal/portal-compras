// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import FormularioUSCampo from "@/app/campo/FormularioUSCampo";

afterEach(cleanup);

describe("FormularioUSCampo", () => {
  it("organiza identificação, aparelho, cabeçote e condições sem esconder os dados salvos", () => {
    render(<FormularioUSCampo
      rel={{ marcas:["T113A1"], resultados:{ procedimento:"PI-QUA-003 - Procedimento de US AWS D1.1", norma:"AWS D1.1", criterio:"AWS D1.1" } }}
      cond={{ apModelo:"Mitech MDF350B", apSerie:"FD10012912", cbModelo:"Mitech angular 20x22 · 70° · 2 MHz", cbSerie:"2206365", cbAngulo:"70" }}
      setCond={() => {}}
    />);
    for (const texto of ["Identificação e documentos", "Aparelho", "Cabeçote", "Condições do ensaio", "T113A1", "PI-QUA-003", "AWS D1.1", "20x22", "2 MHz"]) {
      expect(screen.getAllByText((_, el) => el?.textContent?.includes(texto)).length).toBeGreaterThan(0);
    }
    expect(screen.getByText(/Preenchimento: 5 de 10/)).toBeTruthy();
  });
});
