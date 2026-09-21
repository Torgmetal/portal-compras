// @vitest-environment jsdom
//
// A linha da Vendor List no picker de cotação, para o cadastro SEM e-mail (435 dos ativos,
// importação do Omie). Antes era igual às outras: checkbox aceitava, o clique em "Criar cotações"
// morria num TypeError e a tela não dizia nada (21/09/2026).
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { LinhaFornecedorPicker } from "@/components/compras/LinhaFornecedorPicker";

const gerdau = { id: "f1", razaoSocial: "GERDAU ACOS LONGOS SA", email: null, categorias: [] };
const arcelor = { id: "f2", razaoSocial: "ARCELORMITTAL BRASIL S.A.", email: "equipe.paralegal@arcelormittal.com.br,nfe@arcelormittal.com.br", categorias: [] };

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("cadastro sem e-mail", () => {
  it("mostra 'sem e-mail' e o checkbox não liga", () => {
    render(<LinhaFornecedorPicker fornecedor={gerdau} checked={false} onToggle={() => {}} />);
    expect(screen.getByText("sem e-mail")).toBeTruthy();
    expect(screen.getByRole("checkbox").disabled).toBe(true);
    expect(screen.getByText("informar e-mail")).toBeTruthy();
  });

  // ⚠ O e-mail vai para o CADASTRO (PATCH), não só para este envio — senão a próxima cotação
  // para o mesmo fornecedor bate na mesma parede.
  it("informar e-mail grava no cadastro e destrava a linha", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ fornecedor: { email: "vendas@gerdau.com.br" } }) });
    const onEmailSalvo = vi.fn();
    const { rerender } = render(<LinhaFornecedorPicker fornecedor={gerdau} checked={false} onToggle={() => {}} onEmailSalvo={onEmailSalvo} />);
    fireEvent.click(screen.getByText("informar e-mail"));
    fireEvent.change(screen.getByPlaceholderText("email@fornecedor.com.br"), { target: { value: " Vendas@Gerdau.com.br " } });
    fireEvent.click(screen.getByText("Salvar no cadastro"));
    await waitFor(() => expect(onEmailSalvo).toHaveBeenCalledWith("f1", "vendas@gerdau.com.br"));
    expect(global.fetch).toHaveBeenCalledWith("/api/fornecedores/f1", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ email: "vendas@gerdau.com.br" }),
    }));
    // o pai reflete o e-mail na lista; a linha rerenderiza destravada
    rerender(<LinhaFornecedorPicker fornecedor={{ ...gerdau, email: "vendas@gerdau.com.br" }} checked={false} onToggle={() => {}} onEmailSalvo={onEmailSalvo} />);
    expect(screen.getByRole("checkbox").disabled).toBe(false);
    expect(screen.queryByText("sem e-mail")).toBeNull();
  });

  it("e-mail inválido não chama o servidor", async () => {
    global.fetch = vi.fn();
    render(<LinhaFornecedorPicker fornecedor={gerdau} checked={false} onToggle={() => {}} />);
    fireEvent.click(screen.getByText("informar e-mail"));
    fireEvent.change(screen.getByPlaceholderText("email@fornecedor.com.br"), { target: { value: "sem arroba" } });
    fireEvent.click(screen.getByText("Salvar no cadastro"));
    expect(await screen.findByText("E-mail inválido.")).toBeTruthy();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("dois e-mails no mesmo campo", () => {
  it("mostra o primeiro e deixa selecionar", () => {
    const onToggle = vi.fn();
    render(<LinhaFornecedorPicker fornecedor={arcelor} checked={false} onToggle={onToggle} />);
    expect(screen.getByText("equipe.paralegal@arcelormittal.com.br")).toBeTruthy();
    const cb = screen.getByRole("checkbox");
    expect(cb.disabled).toBe(false);
    fireEvent.click(cb);
    expect(onToggle).toHaveBeenCalled();
  });
});
