// @vitest-environment jsdom
// "Garanta que todos os campos de informações tenham como preencher" (Vitor, 02/10/2026): as quatro
// telas (computador e celular, sais e poeira) têm uma caixa para cada campo dos modelos — das MESMAS
// listas que o PDF imprime e que as rotas gravam.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import FormSais from "@/app/qualidade/inspecoes/[id]/FormSais";
import FormPoeira from "@/app/qualidade/inspecoes/[id]/FormPoeira";
import FormularioSaisCampo from "@/app/campo/FormularioSaisCampo";
import FormularioPoeiraCampo from "@/app/campo/FormularioPoeiraCampo";
import { CAMPOS_CABECALHO_SAIS, N_AMOSTRAS } from "@/lib/sais-campos";
import { CAMPOS_CABECALHO_POEIRA, TESTES_POEIRA } from "@/lib/poeira-campos";

afterEach(cleanup);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const rotulo = (r) => new RegExp(`^${esc(r)}( \\*)?$`);
const relSais = { tipo: "SAIS", opNumero: "112", marcas: ["T112A1"], resultados: {} };
const relPoeira = { tipo: "POEIRA", opNumero: "112", marcas: ["T112A1"], resultados: {} };

describe("computador", () => {
  it("sais: uma caixa para cada campo do cabeçalho e 4 por amostra (água, amostra, densidade, hora)", () => {
    const { container } = render(<FormSais rel={relSais} res={{}} travado={false} setResultado={vi.fn()} />);
    for (const c of CAMPOS_CABECALHO_SAIS) expect(screen.getByLabelText(rotulo(c.rotulo)), c.k).toBeTruthy();
    expect(container.querySelectorAll("tbody input[type=text]").length).toBe(3 * N_AMOSTRAS);
    expect(container.querySelectorAll("tbody input[type=time]").length).toBe(N_AMOSTRAS);
    // a peça e o Bresle padrão aparecem apagados quando vazios — é o que vai sair no PDF
    expect(screen.getByLabelText(rotulo("Peça inspecionada")).getAttribute("placeholder")).toBe("T112A1");
    expect(screen.getByLabelText(rotulo("Volume de água injetado (ml)")).getAttribute("placeholder")).toBe("3");
  });

  it("sais: no computador a hora NÃO nasce sozinha — ali se passa a limpo depois, e seria a hora da digitação", () => {
    const setResultado = vi.fn();
    const { container } = render(<FormSais rel={relSais} res={{}} travado={false} setResultado={setResultado} />);
    const linhaAmostra = container.querySelectorAll("tbody tr")[1];
    fireEvent.change(linhaAmostra.querySelectorAll("input")[0], { target: { value: "12" } });
    const [chave, amostras] = setResultado.mock.calls.at(-1);
    expect(chave).toBe("amostras");
    expect(amostras[0].condAmostra).toBe("12");
    expect(amostras[0].hora).toBeUndefined();
  });

  it("a data do ensaio é um campo de data, e as caixas não aceitam mais do que a rota grava", () => {
    render(<FormSais rel={relSais} res={{}} travado={false} setResultado={vi.fn()} />);
    expect(screen.getByLabelText(rotulo("Data do ensaio")).getAttribute("type")).toBe("date");
    expect(screen.getByLabelText(rotulo("Documento de referência")).getAttribute("maxlength")).toBe("500");
    expect(screen.getByLabelText(rotulo("Ordem de compra")).getAttribute("maxlength")).toBe("120");
  });

  it("sais: densidade digitada longe da calculada aparece como aviso na tela", () => {
    const res = { amostras: [{ condAgua: "1", condAmostra: "11", densidade: "30" }] };
    render(<FormSais rel={relSais} res={res} travado={false} setResultado={vi.fn()} />);
    expect(screen.getByText(/Amostra 1: a densidade digitada \(30\)/)).toBeTruthy();
  });

  it("poeira: caixa para cada campo do cabeçalho, e por teste local, duas classes e observação", () => {
    const { container } = render(<FormPoeira rel={relPoeira} res={{}} travado={false} setResultado={vi.fn()} />);
    for (const c of CAMPOS_CABECALHO_POEIRA) expect(screen.getByLabelText(rotulo(c.rotulo)), c.k).toBeTruthy();
    const linhas = container.querySelectorAll("tbody")[0].querySelectorAll("tr");
    expect(linhas.length).toBe(TESTES_POEIRA.length);
    for (const tr of linhas) {
      expect(tr.querySelectorAll("input[type=text]").length).toBe(2);
      expect(tr.querySelectorAll("select").length).toBe(2);
    }
    expect(screen.getByLabelText("Classificação das partículas")).toBeTruthy();
    expect(screen.getByLabelText(rotulo("Ampliação")).getAttribute("placeholder")).toMatch(/10/);
  });
});

describe("celular", () => {
  it("sais: os mesmos campos, cinco amostras com as quatro caixas", () => {
    const { container } = render(<FormularioSaisCampo rel={relSais} cond={{}} setCond={vi.fn()} />);
    for (const c of CAMPOS_CABECALHO_SAIS) expect(screen.getByLabelText(rotulo(c.rotulo)), c.k).toBeTruthy();
    expect(screen.getAllByText(/^Amostra \d$/).length).toBe(N_AMOSTRAS);
    expect(container.querySelectorAll("input[type=time]").length).toBe(N_AMOSTRAS);
  });

  it("sais: a hora nasce sozinha também no celular", () => {
    let cond = {};
    const setCond = vi.fn((f) => { cond = typeof f === "function" ? f(cond) : f; });
    render(<FormularioSaisCampo rel={relSais} cond={{}} setCond={setCond} />);
    fireEvent.change(screen.getAllByLabelText("Amostra (µS/cm)")[0], { target: { value: "15" } });
    expect(cond.amostras[0]).toMatchObject({ condAmostra: "15" });
    expect(cond.amostras[0].hora).toMatch(/^\d{2}:\d{2}$/);
  });

  it("poeira: os mesmos campos, cinco testes com local, as duas classes e observação", () => {
    render(<FormularioPoeiraCampo rel={relPoeira} cond={{}} setCond={vi.fn()} />);
    for (const c of CAMPOS_CABECALHO_POEIRA) expect(screen.getByLabelText(rotulo(c.rotulo)), c.k).toBeTruthy();
    expect(screen.getAllByLabelText("Local (opcional)").length).toBe(TESTES_POEIRA.length);
    expect(screen.getAllByLabelText("Quantidade (0–5)").length).toBe(TESTES_POEIRA.length);
    expect(screen.getAllByLabelText("Tamanho (0–5)").length).toBe(TESTES_POEIRA.length);
    expect(screen.getAllByLabelText("Observação").length).toBe(TESTES_POEIRA.length);
    expect(screen.getByLabelText("Classificação das partículas")).toBeTruthy();
  });

  it("desmarcar o resultado no celular faz o resumo voltar a cobrar o laudo (não volta ao gravado)", () => {
    const completo = { etapaPintura: "Após o jateamento", fitaAdesiva: "Fita 25 mm", testes: [{ quantidade: "1", tamanho: "1" }] };
    render(<FormularioPoeiraCampo rel={{ ...relPoeira, resultadoInspecao: "APROVADO" }} cond={completo} setCond={vi.fn()} resultado={null} />);
    expect(screen.getByText(/Laudo não marcado/)).toBeTruthy();
  });

  it("o resumo diz o que falta, e some quando o modelo está completo", () => {
    const completo = { etapaPintura: "Após o jateamento", fitaAdesiva: "Fita 25 mm", testes: [{ local: "Alma", quantidade: "1", tamanho: "1" }] };
    render(<FormularioPoeiraCampo rel={relPoeira} cond={completo} setCond={vi.fn()} resultado="APROVADO" />);
    expect(screen.getByText(/Tudo o que o modelo pede está preenchido/)).toBeTruthy();
  });
});
