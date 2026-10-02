// @vitest-environment jsdom
// "Garanta que todos os campos tenham como preencher": as quatro telas (computador e celular, pull-off e
// recebimento de tintas) têm uma caixa para cada campo dos modelos — das MESMAS listas que o PDF imprime e
// que as rotas gravam. E o recebimento preenche pelos lotes do CMR.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import FormPullOff from "@/app/qualidade/inspecoes/[id]/FormPullOff";
import FormRecebimentoTinta from "@/app/qualidade/inspecoes/[id]/FormRecebimentoTinta";
import FormularioPullOffCampo from "@/app/campo/FormularioPullOffCampo";
import FormularioRecebimentoTintaCampo from "@/app/campo/FormularioRecebimentoTintaCampo";
import { CAMPOS_CABECALHO_PULLOFF } from "@/lib/pulloff-campos";
import { CAMPOS_CABECALHO_RECEBIMENTO, ITENS_RECEBIMENTO } from "@/lib/recebimento-tinta-campos";

const TINTAS = [
  { id: "t1", produto: "WEGPOXI WET SURFACE 89 CINZA", tipo: "WEGPOXI WET SURFACE 89", fabricante: "WEG", lote: "8912-1", validade: "2027-03-15", certificado: "CQ-777" },
  { id: "t2", produto: "ENDURECEDOR WET SURFACE", tipo: "ENDURECEDOR", fabricante: "WEG", lote: "8913-1", validade: "2027-03-16" },
];
beforeEach(() => {
  globalThis.React = React;
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ tintas: TINTAS }) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const rotulo = (r) => new RegExp(`^${esc(r)}( \\*)?$`);
const relPO = { tipo: "PULL_OFF", opNumero: "112", marcas: ["T112A1"], resultados: {} };
const relRT = { tipo: "RECEBIMENTO_TINTA", opNumero: "112", marcas: ["T112A1"], resultados: {} };

describe("computador", () => {
  it("pull-off: uma caixa para cada campo do cabeçalho, 3 demãos e 5 dollies com adesão, rompimento e falha", () => {
    render(<FormPullOff rel={relPO} res={{}} travado={false} setResultado={vi.fn()} />);
    for (const c of CAMPOS_CABECALHO_PULLOFF) expect(screen.getByLabelText(rotulo(c.rotulo)), c.k).toBeTruthy();
    for (let i = 1; i <= 3; i++) expect(screen.getByLabelText(`Espessura da ${i}ª demão`)).toBeTruthy();
    for (let i = 1; i <= 5; i++) {
      expect(screen.getByLabelText(`Adesão do dolly ${i}`)).toBeTruthy();
      expect(screen.getByLabelText(`Rompimento do dolly ${i}`)).toBeTruthy();
      expect(screen.getByLabelText(`Falha do dolly ${i}`)).toBeTruthy();
    }
    expect(screen.getByLabelText(rotulo("Data da fixação")).getAttribute("type")).toBe("date");
  });

  it("pull-off: lançar a adesão grava o dolly certo, e a média aparece como a planilha", () => {
    const setResultado = vi.fn();
    render(<FormPullOff rel={relPO} res={{ dollies: [{ adesao: "8" }, { adesao: "9" }] }} travado={false} setResultado={setResultado} />);
    expect(screen.getByText(/8,5 MPa/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Adesão do dolly 3"), { target: { value: "9,5" } });
    const [chave, dollies] = setResultado.mock.calls.at(-1);
    expect(chave).toBe("dollies");
    expect(dollies[2]).toMatchObject({ adesao: "9,5" });
  });

  it("pull-off: o dolly que não rompeu se lança pela falha 'Sem ruptura' — a média vira mínimo; adesivo vencido avisa", () => {
    const res = { validadeAdesivo: "2026-09-30", dataFixacao: "2026-10-01", dollies: [{ adesao: "20", falha: "Sem ruptura" }, { adesao: "8", falha: "Coesão" }] };
    render(<FormPullOff rel={relPO} res={res} travado={false} setResultado={vi.fn()} />);
    expect([...screen.getByLabelText("Falha do dolly 1").querySelectorAll("option")].map((o) => o.value)).toContain("Sem ruptura");
    expect(screen.getByText(/> 14/)).toBeTruthy();
    expect(screen.getByText(/Adesivo vencido na data da fixação/)).toBeTruthy();
  });

  it("recebimento: caixa para cada campo, 3 lotes com lote/quantidade/fabricação/validade e os 9 itens A/R", () => {
    render(<FormRecebimentoTinta rel={relRT} res={{}} travado={false} setResultado={vi.fn()} />);
    for (const c of CAMPOS_CABECALHO_RECEBIMENTO) expect(screen.getByLabelText(rotulo(c.rotulo)), c.k).toBeTruthy();
    for (const c of ["A", "B", "C"]) for (const k of ["Lote", "Quantidade", "Fabricação", "Validade"]) expect(screen.getByLabelText(`${k} do componente ${c}`)).toBeTruthy();
    ITENS_RECEBIMENTO.forEach((_, i) => {
      expect(screen.getByLabelText(`Item ${i + 1}: Aprovado`)).toBeTruthy();
      expect(screen.getByLabelText(`Item ${i + 1}: Reprovado`)).toBeTruthy();
    });
  });

  it("recebimento: escolher os lotes do CMR preenche material, fabricante, certificado, lotes e validade", async () => {
    const setResultado = vi.fn();
    render(<FormRecebimentoTinta rel={relRT} res={{}} travado={false} setResultado={setResultado} />);
    await waitFor(() => expect(screen.getByLabelText("Lote do CMR para o componente A").querySelectorAll("option").length).toBe(3));
    fireEvent.change(screen.getByLabelText("Lote do CMR para o componente A"), { target: { value: "t1" } });
    fireEvent.change(screen.getByLabelText("Lote do CMR para o componente B"), { target: { value: "t2" } });
    fireEvent.click(screen.getByRole("button", { name: "Preencher" }));
    const gravado = Object.fromEntries(setResultado.mock.calls);
    expect(gravado).toMatchObject({ material: "WEGPOXI WET SURFACE 89", fabricante: "WEG", certificado: "CQ-777" });
    expect(gravado.lotes[0]).toMatchObject({ lote: "8912-1", validade: "2027-03-15" });
    expect(gravado.lotes[1]).toMatchObject({ lote: "8913-1", validade: "2027-03-16" });
  });
});

describe("celular", () => {
  it("pull-off: os mesmos campos, 3 demãos e 5 dollies", () => {
    render(<FormularioPullOffCampo rel={relPO} cond={{}} setCond={vi.fn()} />);
    for (const c of CAMPOS_CABECALHO_PULLOFF) expect(screen.getByLabelText(rotulo(c.rotulo)), c.k).toBeTruthy();
    expect(screen.getAllByText(/^Dolly \d$/)).toHaveLength(5);
    expect(screen.getAllByLabelText("Adesão (MPa)")).toHaveLength(5);
    expect(screen.getAllByLabelText(/ª demão \(µm\)$/)).toHaveLength(3);
  });

  it("recebimento: os mesmos campos, os 3 lotes e os 9 itens; o CMR preenche também", async () => {
    let cond = {};
    const setCond = vi.fn((f) => { cond = typeof f === "function" ? f(cond) : f; });
    render(<FormularioRecebimentoTintaCampo rel={relRT} cond={{}} setCond={setCond} />);
    for (const c of CAMPOS_CABECALHO_RECEBIMENTO) expect(screen.getByLabelText(rotulo(c.rotulo)), c.k).toBeTruthy();
    expect(screen.getAllByLabelText("Nº do lote")).toHaveLength(3);
    expect(screen.getAllByLabelText(/^Item \d: Aprovado$/)).toHaveLength(9);
    await waitFor(() => expect(screen.getByRole("button", { name: "Preencher com estes lotes" })).toBeTruthy());
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "t1" } });
    fireEvent.click(screen.getByRole("button", { name: "Preencher com estes lotes" }));
    expect(cond).toMatchObject({ material: "WEGPOXI WET SURFACE 89", fabricante: "WEG" });
    expect(cond.lotes[0]).toMatchObject({ lote: "8912-1" });
  });

  it("o resumo do recebimento: reprovar com tudo aprovado pede o motivo — escrito AGORA na tela já vale", () => {
    const completo = { material: "W", fabricante: "WEG", dataInspecao: "2026-10-01", lotes: [{ lote: "L1", validade: "2099-01-01" }], checklist: Object.fromEntries(ITENS_RECEBIMENTO.map((_, i) => [i + 1, "A"])) };
    const { rerender } = render(<FormularioRecebimentoTintaCampo rel={relRT} cond={completo} setCond={vi.fn()} resultado="REPROVADO" observacoes="" />);
    expect(screen.getByText(/Reprovado com os nove itens aprovados/)).toBeTruthy();
    rerender(<FormularioRecebimentoTintaCampo rel={relRT} cond={completo} setCond={vi.fn()} resultado="REPROVADO" observacoes="Produto trocado." />);
    expect(screen.getByText(/Tudo o que o modelo pede está preenchido/)).toBeTruthy();
    rerender(<FormularioRecebimentoTintaCampo rel={relRT} cond={completo} setCond={vi.fn()} resultado="APROVADO" observacoes="" />);
    expect(screen.getByText(/Tudo o que o modelo pede está preenchido/)).toBeTruthy();
  });
});
