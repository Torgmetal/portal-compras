import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// O AMBIENTE DE DEMONSTRAÇÃO (Vitor, 21/09/2026): "um localhost para simular essa OP, desde a
// geração da OP até a expedição, para mostrarmos ao cliente… uma OP fake só para eu passar tudo
// com eles e ir ajustando". O localhost grava no banco de produção e fala com Omie, Resend e
// SharePoint de verdade — uma OP fake ali dispararia e-mail para fornecedor e pedido no ERP. O
// modo demo aponta para o banco local (torg_demo) e corta as três saídas.

const ORIG = { ...process.env };
afterEach(() => { process.env = { ...ORIG }; vi.resetModules(); });

describe("MODO_DEMO", () => {
  it("está desligado por padrão — produção não muda nada", async () => {
    delete process.env.MODO_DEMO;
    const { emModoDemo } = await import("@/lib/modo-demo");
    expect(emModoDemo()).toBe(false);
  });

  it("e-mail: não chama o Resend, devolve ok e diz que é demo", async () => {
    process.env.MODO_DEMO = "1"; process.env.RESEND_API_KEY = "re_fake";
    vi.doMock("resend", () => ({ Resend: vi.fn(() => { throw new Error("não podia instanciar o Resend em demo"); }) }));
    const { sendEmail } = await import("@/lib/email");
    const r = await sendEmail({ to: "fornecedor@exemplo.com", subject: "Cotação", html: "<p>x</p>" });
    expect(r).toMatchObject({ ok: true, demo: true });
    expect(r.id).toMatch(/^demo-/);
  });

  it("Omie: a chamada é recusada com mensagem de demo, sem ir à rede", async () => {
    process.env.MODO_DEMO = "1"; process.env.OMIE_APP_KEY = "k"; process.env.OMIE_APP_SECRET = "s";
    global.fetch = vi.fn(() => { throw new Error("não podia bater no Omie em demo"); });
    const { omieCall } = await import("@/lib/omie-call");
    await expect(omieCall("https://app.omie.com.br/api/v1/x/", "ListarClientes", {})).rejects.toThrow(/demonstra/i);
    const { criarPedidoOmie } = await import("@/lib/omie-pedido-compra");
    const r = await criarPedidoOmie({ itens: [{ x: 1 }] });
    expect(r.success).toBe(true);
    expect(String(r.numero_pedido)).toMatch(/^DEMO-/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("SharePoint: gravações vão para /DEMO/…, com a barra inicial que o Graph exige", async () => {
    process.env.MODO_DEMO = "1";
    const { pastaDeGravacao } = await import("@/lib/modo-demo");
    expect(pastaDeGravacao("/Ordem de Servico/01. OP/OP-122/4. Expedição")).toBe("/DEMO/Ordem de Servico/01. OP/OP-122/4. Expedição");
    expect(pastaDeGravacao("SERVIDOR/x")).toBe("/DEMO/SERVIDOR/x");
    expect(pastaDeGravacao("/DEMO/SERVIDOR/x")).toBe("/DEMO/SERVIDOR/x");
  });

  // ⚠⚠ A REGRESSÃO DE 21/09/2026: fora do demo a função tirava a barra inicial, o Graph só aceita
  // `root:/caminho`, e toda gravação no SharePoint da produção passou a falhar (lote de desenhos
  // da OP-94/118, romaneio, data book). Fora do demo o caminho tem de voltar IDÊNTICO.
  it("fora do demo o caminho volta intocado — barra inicial inclusive", async () => {
    delete process.env.MODO_DEMO;
    const { pastaDeGravacao } = await import("@/lib/modo-demo");
    for (const c of ["/Ordem de Servico/01. OP/OP-094/2. Engenharia/2.5 Projetos/2.5.2 Fabricação/A3", "/RH/Workspace", "SERVIDOR/x", "//dupla", ""]) {
      expect(pastaDeGravacao(c)).toBe(c);
    }
  });
});
