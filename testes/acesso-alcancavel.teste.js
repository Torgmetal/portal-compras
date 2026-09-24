import { describe, it, expect } from "vitest";
import { moduloNegado } from "@/lib/portao-modulos";
import { menu as menuCompras } from "@/components/Sidebar";
import { menu as menuRM } from "@/components/SidebarRM";
import { MODULOS } from "@/lib/modulos-portal";

// ─── PERMISSÃO QUE NINGUÉM ACHA É PERMISSÃO QUE NÃO EXISTE ───────────────────
//
// ⚠⚠⚠ ESTE ARQUIVO NASCEU DE UM ERRO MEU (24/09/2026). Abri `/compras/prazos` para o módulo
// ALMOXARIFADO no portão e pus o link em `components/Sidebar.jsx` — que é a sidebar renderizada
// DENTRO de `/compras/*`. Só que o Almoxarifado nunca chega lá: o card "Compras" do menu de
// módulos exige o módulo COMPRAS. Matheus voltou dizendo *"ainda está sem acesso, não aparece no
// menu de módulos dele"*, e estava certo — do lado dele, portão aberto sem link é idêntico a
// acesso negado.
//
// A regra que este teste guarda: toda rota que o portão abre a um módulo precisa ter LINK numa
// sidebar que aquele módulo enxerga.

const visiveis = (lista, mods, padrao) =>
  lista.filter((m) => (m.modulos ?? padrao ?? []).some((x) => mods.includes(x)) || (!m.modulos && !padrao));

/** As sidebars que um usuário com estes módulos consegue renderizar, pela rota-raiz que ele abre. */
const linksQueEleVe = (mods) => {
  const links = [];
  // ⚠ A sidebar do Compras só renderiza para quem consegue ENTRAR em /compras/*; a do RM, para quem
  // tem o card Requisições. É essa dependência que o meu erro ignorou.
  const cardRM = MODULOS.find((c) => c.href === "/rm");
  if ((cardRM?.modulos ?? []).some((x) => mods.includes(x))) {
    links.push(...visiveis(menuRM, mods, null).map((m) => m.href));
    links.push(...menuRM.filter((m) => !m.modulos).map((m) => m.href));
  }
  const cardCompras = MODULOS.find((c) => c.href === "/compras");
  if ((cardCompras?.modulos ?? []).some((x) => mods.includes(x))) {
    links.push(...menuCompras.map((m) => m.href));
  }
  return [...new Set(links)];
};

const ALMOX = ["ALMOXARIFADO", "REQUISICOES", "EXPEDICAO"];

describe("o almoxarifado consegue CHEGAR nas telas que o portão abre para ele", () => {
  it("o portão deixa passar em Prazos das RMs", () => {
    expect(moduloNegado("/compras/prazos", { modulos: ALMOX })).toBeNull();
  });

  // ⚠⚠ O TESTE QUE FALTAVA. Sem ele, a entrega parecia pronta e não era.
  it("e existe um link para ela numa sidebar que ele enxerga", () => {
    expect(linksQueEleVe(ALMOX)).toContain("/compras/prazos");
  });

  it("o mesmo vale para o Recebimento (CMR), que já funcionava", () => {
    expect(moduloNegado("/compras/recebimento-cmr", { modulos: ALMOX })).toBeNull();
    expect(linksQueEleVe(ALMOX)).toContain("/compras/recebimento-cmr");
  });

  // ⚠ Ele NÃO enxerga a sidebar do Compras, e é isso que torna o teste acima necessário — se
  // enxergasse, o link de lá bastaria e o meu erro não existiria.
  it("ele não tem o card Compras — por isso a sidebar do Compras não conta como caminho", () => {
    const card = MODULOS.find((c) => c.href === "/compras");
    expect((card?.modulos ?? []).some((x) => ALMOX.includes(x))).toBe(false);
  });
});

describe("quem tem COMPRAS continua vendo tudo pelo caminho de sempre", () => {
  it("o link de Prazos está na sidebar do Compras", () => {
    expect(menuCompras.map((m) => m.href)).toContain("/compras/prazos");
  });
  it("e o portão deixa passar", () => {
    expect(moduloNegado("/compras/prazos", { modulos: ["COMPRAS"] })).toBeNull();
  });
});
