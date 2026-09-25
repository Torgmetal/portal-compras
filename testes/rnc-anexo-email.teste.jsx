// @vitest-environment jsdom
// A tela da RNC aceita e-mail como anexo — a reclamação do cliente chega por e-mail (Vitor,
// 25/09/2026: "preciso que dê permissão para anexar EMS, EML mensagens").
//
// ⚠ O .msg do Outlook chega do navegador SEM tipo (no Mac o sistema não o conhece). Sem o tipo
// explícito no upload, o Blob não tem como liberar o arquivo — por isso o teste manda o .msg com
// `type: ""`, que é o caso real.
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const blob = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock("@vercel/blob/client", () => blob);
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }) => <a href={href} {...p}>{children}</a> }));
vi.mock("@/components/qualidade/ProtecaoEdicao", () => ({ default: () => null }));
vi.mock("@/app/qualidade/rnc/[id]/SeletorPecasLE", () => ({ default: () => null }));
vi.mock("@/app/qualidade/rnc/[id]/Apontamentos", () => ({ default: () => null }));

const { default: RncDetalheClient } = await import("@/app/qualidade/rnc/[id]/RncDetalheClient");

let atual;
const rnc = (tipo, anexos = []) => ({
  id: "r1", numero: 21, ano: 2026, tipo, status: "ABERTA", descricao: "Chapa com empeno", elaborador: "Geraldo",
  anexos, apontamentos: [], reinspecaoFotos: [], pecas: [], cincoPorques: [],
});

beforeEach(() => {
  atual = rnc("INTERNA");
  blob.upload.mockReset();
  blob.upload.mockImplementation(async (caminho) => ({ url: `https://blob.example/${caminho}` }));
  global.fetch = vi.fn(async (_url, init) => {
    if (init?.method === "PATCH") return { ok: true, json: async () => ({ success: true }) };
    return { ok: true, json: async () => ({ rnc: atual, plano: null }) };
  });
});
afterEach(() => cleanup());

async function abrir() {
  const r = render(<RncDetalheClient id="r1" />);
  await screen.findByText("Anexos");
  const input = [...r.container.querySelectorAll('input[type="file"]')].find((i) => (i.getAttribute("accept") || "").includes(".pdf"));
  return { ...r, input };
}
const corpoDoPatch = () => JSON.parse(global.fetch.mock.calls.find(([, init]) => init?.method === "PATCH")[1].body);

describe("anexar e-mail na RNC", () => {
  it("o seletor aceita .eml e .msg na RNC interna e na de cliente", async () => {
    const interna = await abrir();
    expect(interna.input.getAttribute("accept")).toMatch(/\.eml/);
    expect(interna.input.getAttribute("accept")).toMatch(/\.msg/);
    cleanup();
    atual = rnc("CLIENTE");
    const cliente = await abrir();
    expect(cliente.input.getAttribute("accept")).toMatch(/\.eml/);
    expect(cliente.input.getAttribute("accept")).toMatch(/\.msg/);
  });

  it("o .msg do Outlook sobe com o tipo certo mesmo quando o navegador não sabe o tipo", async () => {
    const { input } = await abrir();
    fireEvent.change(input, { target: { files: [new File(["From: cliente"], "Reclamação do cliente.msg", { type: "" })] } });
    await waitFor(() => expect(blob.upload).toHaveBeenCalled());
    const [caminho, , opcoes] = blob.upload.mock.calls[0];
    expect(caminho).toMatch(/^qualidade\/rnc\/anexos\/.+\.msg$/);
    expect(opcoes).toMatchObject({ contentType: "application/vnd.ms-outlook", handleUploadUrl: "/api/qualidade/documentos/upload-token" });
    await waitFor(() => expect(corpoDoPatch().anexos).toEqual([expect.objectContaining({ nome: "Reclamação do cliente.msg", tipo: "application/vnd.ms-outlook" })]));
  });

  it("PDF continua subindo como sempre, sem tipo forçado", async () => {
    const { input } = await abrir();
    fireEvent.change(input, { target: { files: [new File(["%PDF"], "laudo.pdf", { type: "application/pdf" })] } });
    await waitFor(() => expect(blob.upload).toHaveBeenCalled());
    expect(blob.upload.mock.calls[0][2]).toEqual({ access: "public", handleUploadUrl: "/api/qualidade/documentos/upload-token" });
  });

  it("o e-mail anexado aparece com ícone de e-mail", async () => {
    atual = rnc("CLIENTE", [{ url: "https://blob.example/a.eml", nome: "reclamacao.eml", tipo: "message/rfc822" }]);
    const { container } = await abrir();
    await screen.findByText("reclamacao.eml");
    expect(container.querySelector("svg.lucide-mail")).not.toBeNull();
  });
});
