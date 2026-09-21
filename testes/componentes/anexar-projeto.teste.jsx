// @vitest-environment jsdom
// O botão "anexar projeto" do relatório de inspeção: depois do upload direto ao blob, é o
// NAVEGADOR que vincula o arquivo ao relatório (PUT). Antes só o webhook fazia isso — e ele
// chegava sem sessão, tomava 401 e o anexo nunca aparecia (OP-105, 21/09/2026).
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock("@vercel/blob/client", () => ({ upload: mocks.upload }));
import AnexarProjeto from "@/app/qualidade/inspecoes/[id]/AnexarProjeto";

const URL_BLOB = "https://abc.public.blob.vercel-storage.com/T105%20-%20Montagem-087xBJzLC5TJUqbgPOKpFJ9jY9lPRW.pdf";
beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

function escolherArquivo(container, nome = "T105 - Montagem.pdf") {
  const input = container.querySelector('input[type="file"]');
  const arq = new File([new Uint8Array([37, 80, 68, 70])], nome, { type: "application/pdf" });
  fireEvent.change(input, { target: { files: [arq] } });
}

describe("anexar projeto", () => {
  it("sobe para o blob e depois VINCULA pelo PUT, só então avisa que mudou", async () => {
    mocks.upload.mockResolvedValue({ url: URL_BLOB, pathname: "T105 - Montagem-087xBJzLC5TJUqbgPOKpFJ9jY9lPRW.pdf" });
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, total: 2 }) });
    const onMudou = vi.fn();
    const { container } = render(<AnexarProjeto relatorioId="r1" somaVarios onMudou={onMudou} />);
    escolherArquivo(container);
    await waitFor(() => expect(onMudou).toHaveBeenCalled());
    expect(mocks.upload).toHaveBeenCalledWith("T105 - Montagem.pdf", expect.any(File), expect.objectContaining({ handleUploadUrl: "/api/qualidade/inspecoes/r1/desenho-anexo" }));
    expect(global.fetch).toHaveBeenCalledWith("/api/qualidade/inspecoes/r1/desenho-anexo", expect.objectContaining({
      method: "PUT",
      body: JSON.stringify({ url: URL_BLOB, nome: "T105 - Montagem.pdf" }),
    }));
  });

  it("se o vínculo falhar, a tela diz — em vez de fingir que anexou", async () => {
    mocks.upload.mockResolvedValue({ url: URL_BLOB });
    global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Relatório já enviado para assinatura." }) });
    const onMudou = vi.fn();
    const { container } = render(<AnexarProjeto relatorioId="r1" onMudou={onMudou} />);
    escolherArquivo(container);
    expect(await screen.findByText("Relatório já enviado para assinatura.")).toBeTruthy();
    expect(onMudou).not.toHaveBeenCalled();
  });

  it("na pré-montagem o × remove só o desenho em vista", async () => {
    global.confirm = vi.fn(() => true);
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    const onMudou = vi.fn();
    render(<AnexarProjeto relatorioId="r1" somaVarios anexado marca="T105 - Montagem" onMudou={onMudou} />);
    fireEvent.click(screen.getByTitle("Remove este anexo do relatório"));
    await waitFor(() => expect(onMudou).toHaveBeenCalled());
    expect(global.fetch).toHaveBeenCalledWith("/api/qualidade/inspecoes/r1/desenho-anexo?marca=T105%20-%20Montagem", { method: "DELETE" });
  });
});
