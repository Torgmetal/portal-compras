// Mensagem de e-mail como anexo da RNC. Vitor (25/09/2026): "nos relatórios de não conformidade,
// preciso que dê permissão para anexar EMS, EML mensagens" — a reclamação do cliente chega por e-mail.
import { describe, it, expect } from "vitest";
import { tipoDeEmail, ehEmail, aceitaEmailNoCaminho, ACEITA_EMAIL, tipoDoArquivo, comTipoDeEmail } from "@/lib/anexo-email";

describe("o tipo do e-mail sai da extensão", () => {
  it("o .eml é message/rfc822 e o .msg do Outlook é application/vnd.ms-outlook", () => {
    expect(tipoDeEmail("reclamacao.eml")).toBe("message/rfc822");
    expect(tipoDeEmail("RTNC 0326-010.msg")).toBe("application/vnd.ms-outlook");
  });

  it("maiúscula na extensão não muda nada", () => {
    expect(tipoDeEmail("RECLAMACAO.EML")).toBe("message/rfc822");
    expect(tipoDeEmail("Resposta.Msg")).toBe("application/vnd.ms-outlook");
  });

  it("o que não é e-mail devolve null — e o anexo segue com o tipo que o navegador deu", () => {
    expect(tipoDeEmail("laudo.pdf")).toBeNull();
    expect(tipoDeEmail("msg")).toBeNull();
    expect(tipoDeEmail("foto.eml.jpg")).toBeNull();
  });
});

describe("reconhecer o anexo já guardado", () => {
  it("pelo tipo ou, se o tipo veio vazio, pelo nome", () => {
    expect(ehEmail({ nome: "a.eml", tipo: "message/rfc822" })).toBe(true);
    expect(ehEmail({ nome: "a", tipo: "application/vnd.ms-outlook" })).toBe(true);
    expect(ehEmail({ nome: "reclamacao.msg", tipo: "" })).toBe(true);
    expect(ehEmail({ nome: "laudo.pdf", tipo: "application/pdf" })).toBe(false);
  });
});

describe("onde o e-mail é aceito", () => {
  it("só nos anexos da RNC — a mesma rota de token serve as outras telas da Qualidade", () => {
    expect(aceitaEmailNoCaminho("qualidade/rnc/anexos/1727-reclamacao.eml")).toBe(true);
    expect(aceitaEmailNoCaminho("qualidade/rnc/reinspecao/1727-foto.jpg")).toBe(false);
    expect(aceitaEmailNoCaminho("qualidade-calibracao/cert/1727-x.pdf")).toBe(false);
    expect(aceitaEmailNoCaminho(undefined)).toBe(false);
  });

  it("o seletor de arquivo oferece as duas extensões", () => {
    expect(ACEITA_EMAIL.split(",")).toEqual([".eml", ".msg"]);
  });
});

describe("no upload", () => {
  const base = { access: "public", handleUploadUrl: "/api/qualidade/documentos/upload-token" };

  it("o e-mail vai com o tipo explícito; o resto sobe com as opções de sempre", () => {
    expect(comTipoDeEmail({ name: "a.msg", type: "" }, base)).toEqual({ ...base, contentType: "application/vnd.ms-outlook" });
    expect(comTipoDeEmail({ name: "laudo.pdf", type: "application/pdf" }, base)).toBe(base);
  });

  it("o tipo guardado no anexo: o do e-mail pela extensão, senão o que o navegador deu", () => {
    expect(tipoDoArquivo({ name: "a.eml", type: "" })).toBe("message/rfc822");
    expect(tipoDoArquivo({ name: "a.msg", type: "application/octet-stream" })).toBe("application/vnd.ms-outlook");
    expect(tipoDoArquivo({ name: "foto.jpg", type: "image/jpeg" })).toBe("image/jpeg");
    expect(tipoDoArquivo({ name: "sem-tipo", type: "" })).toBe("");
  });
});
