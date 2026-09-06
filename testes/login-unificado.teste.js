import { describe, it, expect } from "vitest";
import { modulosPermitidos } from "../lib/modulos-portal";
import { callbackInterno, destinoLogin } from "../lib/destino-login";

const origin = "https://workspace.torg.com.br";
const user = { tipo: "USUARIO", modulos: ["COMPRAS"] };
const links = u => modulosPermitidos(u).map(m => m.href);
describe("módulos exibidos após login e no menu", () => {
  it("mostra somente módulos acessíveis ao comprador", () => {
    expect(links(user)).toEqual(["/comercial", "/compras", "/rm", "/reunioes"]);
  });
  it("não mostra áreas internas para visitantes, clientes ou colaboradores", () => {
    for (const u of [null, {tipo:"CLIENTE"}, {tipo:"FUNCIONARIO"}]) expect(links(u)).toEqual([]);
  });
  it("preserva as allowlists mesmo para administradores", () => {
    const admin = { tipo: "ADMIN", email: "outro@example.com" };
    expect(links(admin)).toContain("/indicadores");
    expect(links(admin)).not.toContain("/admin/usuarios");
    expect(links(admin)).not.toContain("/diretoria");
    expect(links({...admin, email:"vitor@torg.com.br", diretoria:true})).toEqual(expect.arrayContaining(["/admin/usuarios", "/diretoria"]));
  });
  it("envia inspetores ao preenchimento, sem oferecer documentos restritos", () => {
    expect(links({tipo:"USUARIO",modulos:["QUALIDADE_CAMPO"]})).toContain("/qualidade/inspecoes");
    expect(links({tipo:"USUARIO",modulos:["QUALIDADE_CAMPO"]})).not.toContain("/qualidade");
  });
  it("não oferece Produção ao almoxarifado nem Indicadores ao usuário comum", () => {
    expect(links({tipo:"USUARIO",modulos:["ALMOXARIFADO"]})).not.toContain("/producao");
    expect(links({tipo:"USUARIO",modulos:["PRODUCAO"]})).not.toContain("/indicadores");
  });
  it("aceita módulos na forma de registros da sessão", () => {
    expect(links({...user, modulos:[{modulo:"COMPRAS"}]})).toEqual(links(user));
  });
});
describe("destino após autenticação", () => {
  it("abre a seleção por padrão", () => expect(destinoLogin(user)).toBe("/modulos"));
  it.each(["/compras/pedidos?id=12#itens", origin+"/compras/pedidos?id=12#itens"])("preserva link interno %s", callback => {
    expect(destinoLogin(user, callback, origin)).toBe("/compras/pedidos?id=12#itens");
  });
  it.each(["https://outro.example/compras", "//outro.example", "/\\outro.example", "javascript:alert(1)", "/", "/entrar?callbackUrl=/", "/api/auth/signout"])("recusa callback inseguro ou circular %s", callback => {
    expect(callbackInterno(callback, origin)).toBeNull();
    expect(destinoLogin(user, callback, origin)).toBe("/modulos");
  });
  it("preserva a área de colaboradores e clientes", () => {
    expect(destinoLogin({tipo:"FUNCIONARIO"}, "/compras", origin)).toBe("/colaborador");
    expect(destinoLogin({tipo:"CLIENTE"})).toBe("/cliente");
    expect(destinoLogin({tipo:"CLIENTE"}, "/assinar/123", origin)).toBe("/assinar/123");
  });
  it("preserva os links de inspeção e o login do campo", () => {
    const campo={tipo:"USUARIO",modulos:["QUALIDADE_CAMPO"]};
    expect(destinoLogin(campo)).toBe("/campo");
    expect(destinoLogin(campo,"/qualidade/inspecoes/123",origin)).toBe("/qualidade/inspecoes/123");
    expect(destinoLogin(campo,"/qualidade",origin)).toBe("/campo");
    expect(destinoLogin(campo,"/campo-privado",origin)).toBe("/campo");
  });
});
