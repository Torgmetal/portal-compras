// A rota que libera o upload direto para o Blob só aceita e-mail (.eml/.msg) nos anexos da RNC.
// Ela é a MESMA para 8 telas da Qualidade (data book, calibração, auditorias…): abrir para todas
// deixaria entrar e-mail onde ninguém pediu.
import { describe, it, expect, vi, beforeEach } from "vitest";

const blob = vi.hoisted(() => ({ handleUpload: vi.fn() }));
vi.mock("@vercel/blob/client", () => blob);
vi.mock("@/lib/session", () => ({ requireRole: vi.fn(async () => ({ id: "u1" })) }));

import { POST } from "@/app/api/qualidade/documentos/upload-token/route";

// o handleUpload de verdade chama onBeforeGenerateToken com o caminho pedido; aqui devolvemos a config
beforeEach(() => {
  blob.handleUpload.mockImplementation(async ({ body, onBeforeGenerateToken }) => onBeforeGenerateToken(body.payload.pathname, body.payload.clientPayload, false));
});

const liberar = async (pathname) => (await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ type: "blob.generate-client-token", payload: { pathname, clientPayload: null } }) }))).json();

describe("tipos liberados no upload da Qualidade", () => {
  it("anexo da RNC aceita e-mail: .eml e .msg do Outlook", async () => {
    const { allowedContentTypes } = await liberar("qualidade/rnc/anexos/1727-reclamacao.msg");
    expect(allowedContentTypes).toEqual(expect.arrayContaining(["message/rfc822", "application/vnd.ms-outlook", "application/pdf"]));
  });

  it("as outras telas continuam sem e-mail", async () => {
    for (const caminho of ["qualidade/rnc/reinspecao/1-foto.jpg", "qualidade-calibracao/cert/1-x.pdf", "boletins-tinta/1-b.pdf"]) {
      const { allowedContentTypes } = await liberar(caminho);
      expect(allowedContentTypes).not.toContain("message/rfc822");
      expect(allowedContentTypes).not.toContain("application/vnd.ms-outlook");
      expect(allowedContentTypes).toContain("application/pdf");
    }
  });
});
