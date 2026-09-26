// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import AssistenteFiscal from "@/components/fiscal/assistente/AssistenteFiscal";
import { tentativaPara } from "@/components/fiscal/assistente/tentativa";
import { hashDaTentativa } from "@/lib/fiscal/assistente/pedido";

// ⚠⚠ ACHADO DO CODEX (24/09/2026): o fluxo cai DEPOIS do evento `etapa` (que troca a conversa atual
// pela recém-criada) e depois de o anexo ser limpo. O reenvio montava o pedido com o estado ATUAL da
// tela — mesma chave, outro conteúdo — e o servidor respondia 409: a resposta já paga não era
// recuperada e a próxima tentativa virava chamada nova.

const fluxoQueCai = () => {
  const enc = new TextEncoder();
  let i = 0;
  return {
    ok: true, status: 200,
    headers: { get: () => "text/event-stream" },
    body: { getReader: () => ({ read: async () => {
      if (i++ === 0) return { done: false, value: enc.encode('event: etapa\ndata: {"etapa":"consultar_ncm","conversaId":"c-nova"}\n\n') };
      throw new Error("conexão caiu");
    } }) },
  };
};

let envios;
beforeEach(() => {
  envios = [];
  Element.prototype.scrollIntoView = () => {};
  global.fetch = vi.fn(async (url, opt) => {
    if (String(url).startsWith("/api/fiscal/assistente/conversas")) {
      return { ok: true, json: async () => ({ success: true, conversas: [], disponivel: true, consumo: null }) };
    }
    envios.push(opt.body);
    return fluxoQueCai();
  });
});
afterEach(() => cleanup());

const corpo = (b) => (b instanceof FormData
  ? { pergunta: b.get("pergunta"), chave: b.get("chave"), conversaId: b.get("conversaId"), xml: b.get("xml")?.name ?? null }
  : { ...JSON.parse(b), xml: null });

async function perguntarDuasVezes(texto, { xml } = {}) {
  const { container } = render(<AssistenteFiscal showToast={() => {}} />);
  if (xml) fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [xml] } });
  const campo = screen.getByRole("textbox");
  fireEvent.change(campo, { target: { value: texto } });
  fireEvent.submit(campo.closest("form"));
  await waitFor(() => expect(envios).toHaveLength(1));
  // ⚠ Redigita a MESMA pergunta — o que o operador faria. (Que ela volta sozinha ao campo é outro teste.)
  await waitFor(() => expect(screen.getAllByText(/conexão caiu/).length).toBeGreaterThan(0));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: texto } });
  fireEvent.submit(screen.getByRole("textbox").closest("form"));
  await waitFor(() => expect(envios).toHaveLength(2));
  return envios.map(corpo);
}

describe("⚠⚠ reenvio depois de o fluxo cair", () => {
  it("primeira pergunta da conversa: mesma chave e SEM a conversa criada no meio", async () => {
    const [a, b] = await perguntarDuasVezes("Qual o IPI do NCM 7308.90.10?");
    expect(b.chave).toBe(a.chave);
    expect(b.conversaId ?? null).toBe(a.conversaId ?? null);
    expect(hashDaTentativa(b, null)).toBe(hashDaTentativa(a, null));
  });

  it("pergunta com XML: o reenvio leva o mesmo arquivo", async () => {
    const xml = new File(["<nfeProc/>"], "nota.xml", { type: "text/xml" });
    const [a, b] = await perguntarDuasVezes("Confere esta nota?", { xml });
    expect(a.xml).toBe("nota.xml");
    expect(b).toEqual(a);
  });
});

it("depois da queda a pergunta volta ao campo", async () => {
  render(<AssistenteFiscal showToast={() => {}} />);
  const campo = screen.getByRole("textbox");
  fireEvent.change(campo, { target: { value: "Qual CFOP?" } });
  fireEvent.submit(campo.closest("form"));
  await waitFor(() => expect(screen.getByRole("textbox").value).toBe("Qual CFOP?"));
});

describe("tentativaPara", () => {
  const gerar = vi.fn(() => "k-nova");

  it("mesma pergunta reaproveita a tentativa inteira, ignorando o estado atual da tela", () => {
    const p = { chave: "k1", pergunta: "x", conversaId: null, arquivo: "f" };
    expect(tentativaPara(p, { pergunta: "x", conversaId: "c-nova", arquivo: null }, gerar)).toBe(p);
  });

  it("pergunta diferente é tentativa nova, com o estado atual", () => {
    const p = { chave: "k1", pergunta: "x", conversaId: null, arquivo: null };
    expect(tentativaPara(p, { pergunta: "y", conversaId: "c1", arquivo: null }, gerar))
      .toEqual({ chave: "k-nova", pergunta: "y", conversaId: "c1", arquivo: null });
  });
});
