// A lista de fornecedores do envio de cotação nasce de duas origens (Vendor List + avulsos), e a
// Vendor List tem 435 cadastros importados do Omie SEM e-mail e 10 com DOIS e-mails no mesmo
// campo (medido em 21/09/2026). Foi assim que "não estamos conseguindo enviar a cotação": marcar
// um desses derrubava o clique em silêncio ou tomava 400 do servidor.
import { describe, it, expect } from "vitest";
import { montarFornecedoresEnvio, emailPrincipal } from "@/lib/fornecedores-envio";

const gerdau = { id: "f1", razaoSocial: "GERDAU ACOS LONGOS SA", email: null, nCodOmie: "7318285259", cnpj: "07358761000169" };
const arcelor = { id: "f2", razaoSocial: "ARCELORMITTAL BRASIL S.A.", email: "equipe.paralegal@arcelormittal.com.br,nfe@arcelormittal.com.br", nCodOmie: "7318285868", cnpj: "17469701000177" };
const ararense = { id: "f3", razaoSocial: "COMERCIAL ARARENSE LTDA", email: "Fabiano@ComercialArarense.com.br", nCodOmie: "7318287529", cnpj: "44699205000182" };
const cadastrados = [gerdau, arcelor, ararense];
const semAvulso = [{ nome: "", email: "" }];

describe("emailPrincipal", () => {
  it("normaliza e devolve o primeiro e-mail válido de um campo com vários", () => {
    expect(emailPrincipal("equipe.paralegal@arcelormittal.com.br,nfe@arcelormittal.com.br")).toBe("equipe.paralegal@arcelormittal.com.br");
    expect(emailPrincipal("  Fabiano@ComercialArarense.com.br ")).toBe("fabiano@comercialararense.com.br");
    expect(emailPrincipal("a@x.com; b@y.com")).toBe("a@x.com");
  });
  it("sem e-mail utilizável é null, nunca uma exceção", () => {
    for (const v of [null, undefined, "", "   ", "sem email", "@x.com", "a@"]) {
      expect(emailPrincipal(v), JSON.stringify(v)).toBeNull();
    }
  });
});

describe("montarFornecedoresEnvio", () => {
  // ⚠⚠ ERA `f.email.toLowerCase()` fora do try: com `email: null` o clique em "Criar cotações"
  // morria num TypeError e a tela não dizia nada. Quem clicava achava que o portal ignorou.
  it("fornecedor da Vendor List sem e-mail vira ERRO com o nome dele, não exceção", () => {
    const r = montarFornecedoresEnvio({
      fornSelecionadosIds: new Set([gerdau.id, ararense.id]),
      fornecedoresCadastrados: cadastrados,
      fornecedoresLinhas: semAvulso,
    });
    expect(r.fornecedores).toBeUndefined();
    expect(r.error).toMatch(/GERDAU ACOS LONGOS SA/);
    expect(r.error).toMatch(/sem e-mail/i);
  });

  // O Omie devolve "a@x,b@y" num campo só; o servidor valida e-mail e recusava com um despejo
  // de JSON do Zod. Vai o primeiro — os demais são `emailsAdicionais`, que a importação separa.
  it("dois e-mails no mesmo campo: usa o primeiro, minúsculo", () => {
    const r = montarFornecedoresEnvio({
      fornSelecionadosIds: new Set([arcelor.id, ararense.id]),
      fornecedoresCadastrados: cadastrados,
      fornecedoresLinhas: semAvulso,
    });
    expect(r.error).toBeUndefined();
    expect(r.fornecedores.map((f) => f.email)).toEqual([
      "equipe.paralegal@arcelormittal.com.br",
      "fabiano@comercialararense.com.br",
    ]);
    expect(r.fornecedores[0]).toMatchObject({ fornecedorId: "f2", nome: arcelor.razaoSocial, nCodOmie: "7318285868", cnpj: "17469701000177" });
  });

  it("deduplica por e-mail entre cadastrado e avulso, e valida o avulso", () => {
    const r = montarFornecedoresEnvio({
      fornSelecionadosIds: new Set([ararense.id]),
      fornecedoresCadastrados: cadastrados,
      fornecedoresLinhas: [{ nome: "Ararense de novo", email: "FABIANO@comercialararense.com.br" }, { nome: "Outro", email: "x@y.com" }],
    });
    expect(r.fornecedores.map((f) => f.email)).toEqual(["fabiano@comercialararense.com.br", "x@y.com"]);
    expect(montarFornecedoresEnvio({ fornSelecionadosIds: new Set(), fornecedoresCadastrados: [], fornecedoresLinhas: [{ nome: "Sem arroba", email: "abc" }] }).error).toMatch(/Email inválido/);
    expect(montarFornecedoresEnvio({ fornSelecionadosIds: new Set(), fornecedoresCadastrados: [], fornecedoresLinhas: [{ nome: "", email: "a@b.com" }] }).error).toMatch(/nome/i);
  });

  it("id selecionado que não está mais na lista é ignorado", () => {
    const r = montarFornecedoresEnvio({ fornSelecionadosIds: new Set(["sumiu"]), fornecedoresCadastrados: cadastrados, fornecedoresLinhas: semAvulso });
    expect(r).toEqual({ fornecedores: [] });
  });
});

describe("separarEmails", () => {
  it("separa por vírgula, ponto-e-vírgula ou espaço; minúsculo; sem repetição; ordem mantida", async () => {
    const { separarEmails } = await import("@/lib/fornecedores-envio");
    expect(separarEmails("Equipe.Paralegal@arcelormittal.com.br,nfe@arcelormittal.com.br")).toEqual([
      "equipe.paralegal@arcelormittal.com.br", "nfe@arcelormittal.com.br",
    ]);
    expect(separarEmails("a@x.com; A@X.COM b@y.com, lixo")).toEqual(["a@x.com", "b@y.com"]);
    expect(separarEmails(null)).toEqual([]);
  });
});
