import { describe, it, expect } from "vitest";
import { moduloNegado } from "@/lib/portao-modulos";
import { MODULOS } from "@/lib/modulos-portal";

// ─── O PORTÃO POR MÓDULO ─────────────────────────────────────────────────────
//
// ⚠⚠ ESTE ARQUIVO EXISTE POR CAUSA DE UMA OMISSÃO. Em 23/09/2026 a Eduarda (FINANCEIRO) abriu a
// Inteligência Fiscal e viu *"Algo deu errado. Tente novamente"*. O seletor de módulos oferecia o
// card Fiscal para FINANCEIRO, a sidebar mostrava os três links, duas telas funcionavam — e
// `/fiscal` **nunca tinha sido cadastrado no portão**, então a recusa vinha de dentro do Server
// Component, virava exceção e caía no erro genérico.
//
// ⚠⚠ OMISSÃO NÃO APARECE EM REVISÃO DE DIFF: ninguém revisa a linha que não foi escrita. O teste
// que importa aqui é o último — ele varre o seletor de módulos e cobra portão para cada card.

const usuario = (...modulos) => ({ tipo: "USUARIO", modulos });
const admin = { tipo: "ADMIN", modulos: [] };

describe("o Fiscal — o caso que originou este arquivo", () => {
  it("quem tem FINANCEIRO entra nas três telas do módulo, inclusive a Inteligência", () => {
    for (const rota of ["/fiscal", "/fiscal/remessa-terceiro", "/fiscal/inteligencia"]) {
      expect(moduloNegado(rota, usuario("FINANCEIRO"))).toBeNull();
    }
  });

  it("quem tem FISCAL também", () => {
    expect(moduloNegado("/fiscal/inteligencia", usuario("FISCAL"))).toBeNull();
  });

  // ⚠ A recusa DIZ qual módulo falta — é isso que a tela /sem-acesso escreve.
  it("quem não tem nenhum dos dois é recusado nomeando o módulo", () => {
    expect(moduloNegado("/fiscal/inteligencia", usuario("RH"))).toBe("FISCAL");
  });

  // ⚠ `/api/fiscal/...` não passa por aqui — começa com `/api/`, e cada rota tem o seu guarda.
  it("não alcança as rotas de API do fiscal", () => {
    expect(moduloNegado("/api/fiscal/inteligencia/simular", usuario("RH"))).toBeNull();
  });
});

describe("os gates por tipo vêm antes do atalho de ADMIN", () => {
  it("/admin e /versao são por TIPO, não por módulo", () => {
    expect(moduloNegado("/admin/usuarios", usuario("FINANCEIRO"))).toBe("ADMIN");
    expect(moduloNegado("/versao", usuario("FINANCEIRO"))).toBe("ADMIN");
    expect(moduloNegado("/admin/usuarios", admin)).toBeNull();
  });

  it("ADMIN passa em tudo o mais", () => {
    for (const rota of ["/fiscal/inteligencia", "/compras", "/rh", "/qualidade"]) {
      expect(moduloNegado(rota, admin)).toBeNull();
    }
  });
});

describe("as exceções que alguém pediu e que somem numa refatoração", () => {
  it("o Almoxarifado entra no recebimento CMR e no painel de OPs sem ter COMPRAS inteiro", () => {
    expect(moduloNegado("/compras/recebimento-cmr", usuario("ALMOXARIFADO"))).toBeNull();
    expect(moduloNegado("/compras/painel-ops", usuario("ALMOXARIFADO"))).toBeNull();
    expect(moduloNegado("/compras", usuario("ALMOXARIFADO"))).toBe("COMPRAS");
  });

  it("o inspetor de campo entra nas Inspeções, mas não no resto da Qualidade", () => {
    expect(moduloNegado("/qualidade/inspecoes", usuario("QUALIDADE_CAMPO"))).toBeNull();
    expect(moduloNegado("/qualidade/data-book", usuario("QUALIDADE_CAMPO"))).toBe("QUALIDADE");
  });

  it("a lista de OPs é aberta a quem está logado; as sub-áreas do Comercial não", () => {
    expect(moduloNegado("/comercial", usuario("RH"))).toBeNull();
    expect(moduloNegado("/comercial/123", usuario("RH"))).toBeNull();
    expect(moduloNegado("/comercial/orcamentos", usuario("RH"))).toBe("COMERCIAL");
  });

  it("o board de tarefas do Planejamento é de todo setor logado", () => {
    expect(moduloNegado("/planejamento/tarefas", usuario("RH"))).toBeNull();
    expect(moduloNegado("/planejamento", usuario("RH"))).toBe("PLANEJAMENTO");
  });
});

// ⚠⚠ O TESTE QUE PEGA A PRÓXIMA OMISSÃO. Todo card que o seletor oferece precisa de portão: sem
// ele, quem não tem o módulo recebe uma exceção de Server Component em vez da tela /sem-acesso.
describe("todo módulo do seletor tem portão", () => {
  // ⚠⚠ A DIVERGÊNCIA DELIBERADA MORA AQUI, COM O MOTIVO ESCRITO — nunca num `null` silencioso do
  // portão. O seletor só decide QUAL CARD APARECE; o portão decide quem ENTRA, e os dois podem
  // legitimamente discordar. A diferença entre este caso e o do Fiscal é que este alguém escreveu.
  const ABERTAS_DE_PROPOSITO = {
    "/rm": "o histórico de requisições é visível para todo mundo logado; o seletor só destaca o card para quem trabalha nele",
  };
  const comModulo = MODULOS.filter((m) => Array.isArray(m.modulos) && m.modulos.length > 0);

  it.each(comModulo.map((m) => [m.href, m.modulos]))("%s exige %s", (href, modulos) => {
    // quem TEM o módulo passa…
    expect(moduloNegado(href, usuario(modulos[0]))).toBeNull();
    // …e quem não tem NENHUM dos módulos declarados é barrado com um nome.
    const semNenhum = usuario("__NADA__");
    const r = moduloNegado(href, semNenhum);
    if (ABERTAS_DE_PROPOSITO[href]) expect(r).toBeNull();
    else expect(typeof r).toBe("string");
  });

  it("nenhuma rota entra na lista de exceções sem motivo escrito", () => {
    for (const [href, motivo] of Object.entries(ABERTAS_DE_PROPOSITO)) {
      expect(motivo.length, `${href} precisa de um motivo`).toBeGreaterThan(30);
    }
  });
});
