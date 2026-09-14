import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseEquivalenciaTag } from "@/lib/parse-equivalencia-tag";
import { conferirCobertura } from "@/lib/etiqueta-tag-cliente";
import { tagDaEtiqueta, descricaoComTag, tagsPorUnidade, juntarTagsCliente } from "@/lib/etiqueta-campos-extras";

// ─── A "LISTA DE EQUIVALÊNCIA DE TAG" DO TMSA (14/09/2026) ───────────────────
//
// ⚠⚠ A TAG É DA PEÇA, NÃO DA MARCA — e é disso que todo este arquivo trata. Medido no arquivo real
// da OP-105: 51 das 96 marcas aparecem em MAIS DE UMA aba, e as quantidades por aba SOMAM a
// quantidade da Lista de Expedição. Das 4 peças da 105A3, duas vão para o TC 4706 e duas para o
// TC 4707. Lido como "uma TAG por marca", a última aba apagaria a anterior e metade da obra sairia
// com o destino errado.

const CAB = ["ITEM", "MARCA", "  QTD.  ", "  DESCRIÇÃO  ", "ÁREA", "ÁREA T", "PESO", "PESO T", "TAG"];
const aba = (tag, linhas) => [
  [null, null, null, "LISTA DE EQUIVALÊNCIA DE TAG TORG ↔ TMSA"],
  [" CLIENTE:", "  TMSA"],
  [" OP:", "  T105"],
  CAB,
  ...linhas.map(([marca, qtd], i) => [String(i + 1), marca, `${qtd} `, "  PEÇA  ", "1", "1", "1", "1", tag]),
  [null, "TOTAL.:  ", "999 "],
];

function planilha(abas) {
  const wb = XLSX.utils.book_new();
  for (const [nome, linhas] of abas) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), nome);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

describe("o parser da planilha de TAG", () => {
  it("expande cada linha em UMA UNIDADE por peça, na ordem das abas", () => {
    const r = parseEquivalenciaTag(planilha([
      ["TAG TC 4706", aba("TC 4706", [["105A3", 2], ["105A4", 5]])],
      ["TAG TC 4707", aba("TC 4707", [["105A3", 2]])],
    ]));
    expect(r.ok).toBe(true);
    expect(r.unidades.filter((u) => u.marca === "105A3")).toEqual([
      { marca: "105A3", unidade: 1, tag: "TC 4706" },
      { marca: "105A3", unidade: 2, tag: "TC 4706" },
      { marca: "105A3", unidade: 3, tag: "TC 4707" },
      { marca: "105A3", unidade: 4, tag: "TC 4707" },
    ]);
    expect(r.tags).toEqual(["TC 4706", "TC 4707"]);
  });

  // ⚠ O rodapé já virou marca no banco uma vez, em 4 obras — e dava para mandar imprimir 8.705
  // etiquetas de uma peça que não existe.
  it("o rodapé TOTAL.: não vira marca", () => {
    const r = parseEquivalenciaTag(planilha([["TAG A", aba("TC 1", [["105A1", 1]])]]));
    expect(r.unidades.map((u) => u.marca)).toEqual(["105A1"]);
  });

  it("linha sem TAG ou com quantidade inválida é avisada, não engolida", () => {
    const linhas = aba("TC 1", [["105A1", 1], ["105A2", 0]]);
    linhas[4][8] = null; // 105A1 sem TAG — o cabeçalho ocupa as 4 primeiras linhas
    const r = parseEquivalenciaTag(planilha([["TAG A", linhas]]));
    expect(r.ok).toBe(false);
    expect(r.problemas).toHaveLength(2);
  });

  it("aba sem cabeçalho MARCA + TAG é ignorada, e as outras seguem", () => {
    const r = parseEquivalenciaTag(planilha([
      ["Capa", [["qualquer coisa"], ["outra"]]],
      ["TAG A", aba("TC 1", [["105A1", 2]])],
    ]));
    expect(r.ok).toBe(true);
    expect(r.abas[0]).toMatchObject({ aba: "Capa", ignorada: true });
    expect(r.unidades).toHaveLength(2);
  });

  it("arquivo sem nenhuma marca é recusado — e não chega a gravar nada", () => {
    const r = parseEquivalenciaTag(planilha([["Capa", [["nada aqui"]]]]));
    expect(r.ok).toBe(false);
    expect(r.erro).toContain("Nenhuma marca");
  });
});

describe("a cobertura contra a Lista de Expedição", () => {
  const pecas = [{ marca: "105A3", qte: 4 }, { marca: "105A4", qte: 5 }];

  it("tudo coberto é tudo coberto", () => {
    const u = [...Array(4)].map((_, i) => ({ marca: "105A3", unidade: i + 1, tag: "T" }))
      .concat([...Array(5)].map((_, i) => ({ marca: "105A4", unidade: i + 1, tag: "T" })));
    expect(conferirCobertura(u, pecas)).toMatchObject({ total: 9, cobertas: 9, completa: true });
  });

  // ⚠⚠ É A CONFERÊNCIA QUE PRECISA EXISTIR ANTES DE IMPRIMIR: a L.E. foi revisada e criou uma peça
  // que a planilha do cliente ainda não tem.
  it("peça a mais na L.E. aparece como etiqueta que sairá sem TAG", () => {
    const u = [...Array(3)].map((_, i) => ({ marca: "105A3", unidade: i + 1, tag: "T" }));
    const c = conferirCobertura(u, pecas);
    expect(c.completa).toBe(false);
    expect(c.semTag).toContainEqual({ marca: "105A3", qte: 4, comTag: 3 });
    expect(c.cobertas).toBe(3);
  });

  it("marca da planilha que não está na Lista é acusada", () => {
    const c = conferirCobertura([{ marca: "SUMIU", unidade: 1, tag: "T" }], pecas);
    expect(c.foraDaLista).toEqual(["SUMIU"]);
    expect(c.completa).toBe(false);
  });

  it("planilha com mais peças que a Lista também é acusada", () => {
    const u = [...Array(9)].map((_, i) => ({ marca: "105A3", unidade: i + 1, tag: "T" }));
    expect(conferirCobertura(u, pecas).sobrando).toContainEqual({ marca: "105A3", qte: 4, comTag: 9 });
  });
});

describe("qual TAG vai em cada etiqueta", () => {
  const comMapa = (qte, pares) =>
    juntarTagsCliente([{ marca: "105A3", qte, descricao: "Travamento - Mod.1" }],
      tagsPorUnidade(pares.map(([unidade, tag]) => ({ marca: "105A3", unidade, tag }))))[0];

  it("cada etiqueta leva a TAG da SUA unidade", () => {
    const p = comMapa(4, [[1, "TC 4706"], [2, "TC 4706"], [3, "TC 4707"], [4, "TC 4707"]]);
    expect([1, 2, 3, 4].map((i) => tagDaEtiqueta(p, i))).toEqual(["TC 4706", "TC 4706", "TC 4707", "TC 4707"]);
  });

  // ⚠⚠ SEM FALLBACK, AO CONTRÁRIO DO QWS: herdar a TAG de outra unidade manda a peça para o
  // transportador errado, e isso o pátio não descobre.
  it("unidade sem TAG sai SEM prefixo — nunca com a TAG de outra peça", () => {
    const p = comMapa(4, [[1, "TC 4706"], [3, "TC 4707"]]);
    expect(tagDaEtiqueta(p, 2)).toBeNull();
    expect(tagDaEtiqueta(p, 4)).toBeNull();
    expect(descricaoComTag(p, 2)).toBe("TRAVAMENTO - MOD.1");
  });

  // ⚠⚠ NA CAIXA A ETIQUETA É UMA SÓ e sai com `indice = total`: pegar a TAG da última unidade
  // carimbaria a caixa inteira com o destino de UMA peça.
  it("caixa com destinos misturados sai sem prefixo", () => {
    const p = { ...comMapa(4, [[1, "TC 4706"], [2, "TC 4706"], [3, "TC 4707"], [4, "TC 4707"]]), emCaixa: true };
    expect(tagDaEtiqueta(p, 4)).toBeNull();
  });

  it("caixa inteira do mesmo destino leva a TAG", () => {
    const p = { ...comMapa(2, [[1, "TC 4708"], [2, "TC 4708"]]), emCaixa: true };
    expect(tagDaEtiqueta(p, 2)).toBe("TC 4708");
  });

  it("caixa coberta pela metade, mesmo com uma TAG só, sai sem prefixo", () => {
    const p = { ...comMapa(4, [[1, "TC 4708"], [2, "TC 4708"]]), emCaixa: true };
    expect(tagDaEtiqueta(p, 4)).toBeNull();
  });
});

describe("a descrição com a TAG na frente", () => {
  const peca = (tag) => juntarTagsCliente([{ marca: "M", qte: 1, descricao: "Travamento - Mod.1" }],
    tagsPorUnidade([{ marca: "M", unidade: 1, tag }]))[0];

  // ⚠ SEPARADOR " | ", NÃO HÍFEN: o hífen funde dois códigos de origens diferentes num terceiro que
  // não existe em lugar nenhum — mesma lição da TAG da obra e da marca/posição do QWS.
  it("sai 'TC 4706 | DESCRIÇÃO', em caixa alta", () => {
    expect(descricaoComTag(peca("TC 4706"), 1)).toBe("TC 4706 | TRAVAMENTO - MOD.1");
  });

  it("obra sem mapa nenhum sai como sempre", () => {
    expect(descricaoComTag({ descricao: "Travamento - Mod.1" }, 1)).toBe("TRAVAMENTO - MOD.1");
  });
});
