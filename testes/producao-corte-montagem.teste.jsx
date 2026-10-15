// @vitest-environment jsdom
// Matheus (03/10/2026): "uma aba simplificada para os setores corte e montagem — os gerentes
// selecionam a OBRA e depois o setor e verificam o status; o status da peça, os croquis, quantos já
// foram cortados, quantos faltam; e deixe bom para ver no celular".
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import CorteMontagemClient from "@/app/producao/corte-montagem/CorteMontagemClient";

const OPS = { ops: [{ opId: "op124", opNumero: "124", cliente: "MARKO", obra: "Center Norte" }, { opId: "op120", opNumero: "120", cliente: "TMSA", obra: "BIANCHINI" }] };
const MONTAGEM = { opNumero: "124", pecas: [
  { id: "a", marca: "T124A1", descricao: "PL2-1", qte: 1, totalCroquis: 6, prontoMontar: false,
    faltamCroquis: [{ marca: "T124A1-P1", descricao: "PL 12.5", faltaQtd: 2, qtd: 4 }] },
  { id: "b", marca: "T124A2", descricao: "CS2-4", qte: 2, produzidoSyneco: 2, totalCroquis: 2, prontoMontar: true, faltamCroquis: [] },
  { id: "c", marca: "T124A3", descricao: "CS2-5", qte: 2, totalCroquis: 3, prontoMontar: true, faltamCroquis: [] },
] };
const CORTE = { pecas: [
  { id: "p1", marca: "T124A1-P1", descricao: "PL 12.5", qte: 4, produzidoSyneco: 2 },
  { id: "p2", marca: "T124A1-P2", descricao: "PL 8", qte: 3, produzidoSyneco: 3 },
] };

beforeEach(() => {
  global.fetch = vi.fn(async (url) => {
    const u = String(url);
    if (u.includes("/api/producao/desenhos")) {
      return { ok: true, status: 200, json: async () => ({ arquivos: [{ itemId: "it1", nome: "T124A1.pdf", formato: "A3", sizeKb: 120 }], liberacoes: [] }) };
    }
    const corpo = u.includes("/api/pcp/producao") ? OPS : u.includes("setor=CORTE") ? CORTE : MONTAGEM;
    return { ok: true, status: 200, json: async () => corpo };
  });
  try { localStorage.clear(); } catch {}
});
afterEach(cleanup);

const escolherObra = async (id = "op124") => {
  render(<CorteMontagemClient />);
  const sel = await screen.findByLabelText("Obra");
  await waitFor(() => expect(sel.querySelectorAll("option").length).toBeGreaterThan(1));
  fireEvent.change(sel, { target: { value: id } });
};

describe("Produção › Corte e montagem", () => {
  it("escolhe a obra e o setor, e busca na mesma rota do PCP", async () => {
    await escolherObra();
    fireEvent.click(screen.getByRole("button", { name: "Montagem" }));
    await screen.findByText("T124A1");
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("/api/pcp/despacho?opId=op124&setor=MONTAGEM"), expect.anything());
  });

  it("montagem: cada conjunto diz quantos croquis já foram cortados, e toca para ver os que faltam", async () => {
    await escolherObra();
    fireEvent.click(screen.getByRole("button", { name: "Montagem" }));
    const cartao = (await screen.findByText("T124A1")).closest("li");
    expect(cartao.textContent).toMatch(/não iniciado/);
    fireEvent.click(within(cartao).getByRole("button", { name: /0\/6|5\/6|faltam/ }));
    expect(cartao.textContent).toMatch(/T124A1-P1/);
    expect(cartao.textContent).toMatch(/faltam 2 de 4/);
  });

  it("resumo do topo: situação das peças e conjuntos prontos para montar", async () => {
    await escolherObra();
    fireEvent.click(screen.getByRole("button", { name: "Montagem" }));
    await screen.findByText("T124A1");
    const resumo = screen.getByRole("region", { name: "Resumo do setor" });
    expect(resumo.textContent).toMatch(/2\s*não iniciad/);
    expect(resumo.textContent).toMatch(/1\s*pronta/);
    expect(resumo.textContent).toMatch(/1 pronto para montar/); // singular — "5 prontos" no plural
  });

  it("corte: cortado X de Y e quanto falta", async () => {
    await escolherObra();
    fireEvent.click(screen.getByRole("button", { name: "Corte" }));
    const cartao = (await screen.findByText("T124A1-P1")).closest("li");
    expect(cartao.textContent).toMatch(/cortado 2 de 4/);
    expect(cartao.textContent).toMatch(/faltam 2/);
  });

  // Matheus (15/10/2026): "mude o Só o que falta para Não montado" — no Corte, "Não cortado".
  it("'Não cortado' esconde o que já terminou no corte", async () => {
    await escolherObra();
    fireEvent.click(screen.getByRole("button", { name: "Corte" }));
    await screen.findByText("T124A1-P1");
    expect(screen.getByText("T124A1-P2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Não cortado" }));
    expect(screen.queryByText("T124A1-P2")).toBeNull();
  });

  it("'Não montado' esconde o conjunto já montado", async () => {
    await escolherObra();
    fireEvent.click(screen.getByRole("button", { name: "Montagem" }));
    await screen.findByText("T124A2");
    fireEvent.click(screen.getByRole("button", { name: "Não montado" }));
    expect(screen.queryByText("T124A2")).toBeNull();
    expect(screen.getByText("T124A1")).toBeTruthy();
  });

  // Matheus (15/10/2026): "Filtros de Não montado precisa ter de montados também".
  it("'Montado' mostra só o conjunto já montado, e 'Todos' volta a lista inteira", async () => {
    await escolherObra();
    fireEvent.click(screen.getByRole("button", { name: "Montagem" }));
    await screen.findByText("T124A2");
    fireEvent.click(screen.getByRole("button", { name: "Montado" }));
    expect(screen.getByText("T124A2")).toBeTruthy();
    expect(screen.queryByText("T124A1")).toBeNull();
    expect(screen.queryByText("T124A3")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Todos" }));
    expect(screen.getByText("T124A1")).toBeTruthy();
  });

  it("corte: 'Cortado' mostra só o que já foi cortado", async () => {
    await escolherObra();
    fireEvent.click(screen.getByRole("button", { name: "Corte" }));
    await screen.findByText("T124A1-P1");
    fireEvent.click(screen.getByRole("button", { name: "Cortado" }));
    expect(screen.getByText("T124A1-P2")).toBeTruthy();
    expect(screen.queryByText("T124A1-P1")).toBeNull();
  });

  // Matheus (15/10/2026): "pesquisar a marca e o material e trazer todos os conjuntos que usam".
  it("busca pelo croqui ou pelo material traz o conjunto que usa, e diz qual croqui", async () => {
    const comCroquis = { ...MONTAGEM, pecas: MONTAGEM.pecas.map((p) => ({ ...p, croquis:
      p.id === "a" ? [{ marca: "T124A1-P1", material: "PL 12.5" }, { marca: "T124A1-P2", material: "U200X60X6.35" }]
      : p.id === "c" ? [{ marca: "T124A3-P1", material: "U200X60X6.35" }] : [{ marca: "T124A2-P1", material: "L 2X1/4" }] })) };
    global.fetch = vi.fn(async (url) => ({ ok: true, status: 200, json: async () => (String(url).includes("/api/pcp/producao") ? OPS : comCroquis) }));
    await escolherObra();
    fireEvent.click(screen.getByRole("button", { name: "Montagem" }));
    await screen.findByText("T124A1");
    const busca = screen.getByLabelText("Buscar marca, croqui ou material");
    fireEvent.change(busca, { target: { value: "u200x60" } });
    expect(screen.getByText("T124A1")).toBeTruthy();
    expect(screen.getByText("T124A3")).toBeTruthy();
    expect(screen.queryByText("T124A2")).toBeNull();
    expect(screen.getByText("T124A1").closest("li").textContent).toMatch(/usa T124A1-P2 · U200X60X6.35/);
    fireEvent.change(busca, { target: { value: "T124A2-P1" } });
    expect(screen.getByText("T124A2")).toBeTruthy();
    expect(screen.queryByText("T124A1")).toBeNull();
  });

  it("⚠ a busca ignora espaço e caixa: 'pl12.5' acha 'PL 12.5'", async () => {
    await escolherObra();
    fireEvent.click(screen.getByRole("button", { name: "Corte" }));
    await screen.findByText("T124A1-P1");
    fireEvent.change(screen.getByLabelText("Buscar marca, croqui ou material"), { target: { value: "pl12.5" } });
    expect(screen.getByText("T124A1-P1")).toBeTruthy();
    expect(screen.queryByText("T124A1-P2")).toBeNull();
  });

  it("busca por marca", async () => {
    await escolherObra();
    fireEvent.click(screen.getByRole("button", { name: "Montagem" }));
    await screen.findByText("T124A1");
    fireEvent.change(screen.getByLabelText("Buscar marca, croqui ou material"), { target: { value: "a3" } });
    expect(screen.queryByText("T124A1")).toBeNull();
    expect(screen.getByText("T124A3")).toBeTruthy();
  });

  it("erro ao carregar mostra o motivo e 'Tentar novamente'", async () => {
    await escolherObra();
    global.fetch = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ error: "Banco fora" }) }));
    fireEvent.click(screen.getByRole("button", { name: "Montagem" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Banco fora/);
    expect(screen.getByRole("button", { name: /Tentar novamente/ })).toBeTruthy();
  });
});

// Achados do Codex (03/10/2026).
describe("⚠ respostas fora de ordem e toque repetido", () => {
  it("resposta atrasada da seleção anterior não aparece — nem a falha dela", async () => {
    const pend = {};
    global.fetch = vi.fn((url) => {
      const u = String(url);
      if (u.includes("/api/pcp/producao")) return Promise.resolve({ ok: true, status: 200, json: async () => OPS });
      return new Promise((res) => { pend[u.includes("setor=CORTE") ? "corte" : "montagem"] = res; });
    });
    await escolherObra();
    fireEvent.click(screen.getByRole("button", { name: "Montagem" }));
    await waitFor(() => expect(pend.montagem).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Corte" }));
    await waitFor(() => expect(pend.corte).toBeTruthy());
    pend.corte({ ok: true, status: 200, json: async () => CORTE });
    await screen.findByText("T124A1-P1");
    // a de montagem chega depois — e falhando
    pend.montagem({ ok: false, status: 500, json: async () => ({ error: "antiga" }) });
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByText("T124A1-P1")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("T124A1")).toBeNull();
  });

  it("tocar de novo no setor já escolhido mantém a lista", async () => {
    await escolherObra();
    fireEvent.click(screen.getByRole("button", { name: "Montagem" }));
    await screen.findByText("T124A1");
    fireEvent.click(screen.getByRole("button", { name: "Montagem" }));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByText("T124A1")).toBeTruthy();
  });

  // Matheus (03/10/2026): "na montagem é preciso ser possível ver o desenho da peça conforme tem lá no PCP".
  it("montagem: tocar na marca abre o desenho da peça — só para VER, sem emitir nem registrar GRD", async () => {
    await escolherObra();
    fireEvent.click(screen.getByRole("button", { name: "Montagem" }));
    fireEvent.click(await screen.findByRole("button", { name: /desenho de T124A1$/i }));
    await screen.findByText("T124A1.pdf");
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("/api/producao/desenhos?opNumero=124&marca=T124A1"));
    expect(screen.getByRole("button", { name: /ver desenho/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /emitir carimbado/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /imprimir \(grd\)/i })).toBeNull();
  });
});

// Matheus (15/10/2026): aviso discreto de desenho impresso, filtro que responde em obra grande e a
// lista das obras rápida.
describe("Corte e montagem — desenho impresso, lista grande e obras rápidas", () => {
  it("montagem: o conjunto com GRD mostra 'desenho impresso' e a data, discreto", async () => {
    const comGrd = { ...MONTAGEM, pecas: MONTAGEM.pecas.map((p) => (p.id === "c" ? { ...p, grd: { em: "2026-10-15T13:52:00.000Z", por: "Larissa", impressoes: 2 } } : p)) };
    global.fetch = vi.fn(async (url) => ({ ok: true, status: 200, json: async () => (String(url).includes("/api/pcp/producao") ? OPS : String(url).includes("aquecer") ? { ok: true } : comGrd) }));
    await escolherObra();
    fireEvent.click(screen.getByRole("button", { name: "Montagem" }));
    const cartao = (await screen.findByText("T124A3")).closest("li");
    const aviso = within(cartao).getByText(/desenho impresso 15\/10/);
    expect(aviso.getAttribute("title")).toMatch(/Larissa · 2 impressões/);
    expect(screen.getByText("T124A1").closest("li").textContent).not.toMatch(/desenho impresso/);
  });

  it("a lista das obras vem da rota enxuta", async () => {
    await escolherObra();
    expect(global.fetch).toHaveBeenCalledWith("/api/pcp/producao?lista=1", expect.anything());
  });

  it("⚠ ao abrir a Montagem, aquece o desenho da obra uma vez", async () => {
    await escolherObra();
    fireEvent.click(screen.getByRole("button", { name: "Montagem" }));
    await screen.findByText("T124A1");
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/producao/desenhos?opNumero=124&aquecer=1", expect.anything()));
    expect(global.fetch.mock.calls.filter(([u]) => String(u).includes("aquecer")).length).toBe(1);
  });

  it("⚠ lista grande sai em lotes de 60, com 'Mostrar mais'", async () => {
    const muitas = { pecas: Array.from({ length: 130 }, (_, i) => ({ id: `p${i}`, marca: `P${String(i).padStart(3, "0")}`, qte: 1 })) };
    global.fetch = vi.fn(async (url) => ({ ok: true, status: 200, json: async () => (String(url).includes("/api/pcp/producao") ? OPS : muitas) }));
    await escolherObra();
    fireEvent.click(screen.getByRole("button", { name: "Corte" }));
    await screen.findByText("P000");
    expect(screen.getAllByRole("listitem").length).toBe(60);
    fireEvent.click(screen.getByRole("button", { name: /Mostrar mais 60 · 70 restantes/ }));
    expect(screen.getAllByRole("listitem").length).toBe(120);
  });

  it("a última lista de obras aparece na hora, antes da resposta", async () => {
    localStorage.setItem("producao-corte-montagem-obras", JSON.stringify(OPS.ops));
    global.fetch = vi.fn(() => new Promise(() => {})); // a rota nunca responde
    render(<CorteMontagemClient />);
    const sel = await screen.findByLabelText("Obra");
    expect(sel.querySelectorAll("option").length).toBe(3);
  });

  it("⚠ a obra lembrada que saiu da lista atual some da tela junto com as peças", async () => {
    localStorage.setItem("producao-corte-montagem-obras", JSON.stringify([...OPS.ops, { opId: "op999", opNumero: "999", cliente: "X", obra: "Encerrada" }]));
    localStorage.setItem("producao-corte-montagem", JSON.stringify({ opId: "op999", setor: "MONTAGEM" }));
    let soltar;
    const listaAtual = new Promise((r) => { soltar = r; });
    global.fetch = vi.fn(async (url) => {
      if (String(url).includes("/api/pcp/producao")) { await listaAtual; return { ok: true, status: 200, json: async () => OPS }; }
      return { ok: true, status: 200, json: async () => MONTAGEM };
    });
    render(<CorteMontagemClient />);
    await screen.findByText("T124A1"); // a obra lembrada abriu com a lista guardada
    soltar();
    await waitFor(() => expect(screen.queryByText("T124A1")).toBeNull());
    expect(screen.getByLabelText("Obra").value).toBe("");
  });

  // Matheus (15/10/2026): "até os que já estão cortados mas não montados ainda é interessante abrir
  // para ver as peças que compõem".
  it("conjunto com tudo cortado também abre e lista as peças, marcadas como cortadas", async () => {
    const comCroquis = { ...MONTAGEM, pecas: MONTAGEM.pecas.map((p) => (p.id === "c"
      ? { ...p, croquis: [{ marca: "T124A3-P1", material: "PL 8", qtd: 2 }, { marca: "T124A3-P2", material: "L 2X1/4", qtd: 1 }, { marca: "T124A3-P3", material: "CH 6", qtd: 4 }] }
      : p.id === "a" ? { ...p, croquis: [{ marca: "T124A1-P1", material: "PL 12.5", qtd: 4 }, { marca: "T124A1-P2", material: "U200", qtd: 1 }] } : p)) };
    global.fetch = vi.fn(async (url) => ({ ok: true, status: 200, json: async () => (String(url).includes("/api/pcp/producao") ? OPS : comCroquis) }));
    await escolherObra();
    fireEvent.click(screen.getByRole("button", { name: "Montagem" }));
    const pronto = (await screen.findByText("T124A3")).closest("li");
    fireEvent.click(within(pronto).getByRole("button", { name: /3\/3 pronto/ }));
    expect(pronto.textContent).toMatch(/T124A3-P1/);
    expect(pronto.textContent).toMatch(/T124A3-P3/);
    expect(within(pronto).getAllByText(/^cortado/).length).toBe(3);

    // e no conjunto que ainda espera corte, aparecem as duas listas: o que falta e o que já foi
    const falta = screen.getByText("T124A1").closest("li");
    fireEvent.click(within(falta).getByRole("button", { name: /faltam/ }));
    expect(falta.textContent).toMatch(/faltam 2 de 4/);
    expect(falta.textContent).toMatch(/T124A1-P2/);
    expect(within(falta).getAllByText(/^cortado/).length).toBe(1);
  });
});
