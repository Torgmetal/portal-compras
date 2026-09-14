import { describe, it, expect } from "vitest";
import { contarEtiquetas, recusaPorTamanho, recusaPorBytes, MAX_ETIQUETAS, MAX_BYTES }
  from "@/lib/etiquetas-carregamento-limites";

// ⚠⚠ POR QUE EXISTE UM TETO (14/09/2026). A geração custa ~12,5 ms por etiqueta em produção e o PDF
// sai a ~1,9 KB por etiqueta. Marcar TUDO nas obras maiores é impossível por construção — a OP-067
// são 60.281 etiquetas, ~753 s e ~113 MB — e a Vercel recusa corpo de resposta acima de ~4,5 MB.
// A recusa tem de vir NA HORA, e não depois da espera.

const peca = (marca, qte, extra = {}) => ({ marca, qte, ...extra });

describe("contar o que a seleção rende", () => {
  it("uma etiqueta por peça", () => {
    expect(contarEtiquetas([peca("A", 3), peca("B", 4)])).toBe(7);
  });

  // ⚠⚠ A MARCA EM CAIXA RENDE UMA, e a rota contava errado até hoje: somava as peças ignorando a
  // caixa. Usada como limite, essa conta recusaria impressão que cabe folgada.
  it("a marca em caixa conta 1, venha o carimbo na peça ou na lista da tela", () => {
    expect(contarEtiquetas([peca("A", 50, { emCaixa: true })])).toBe(1);
    expect(contarEtiquetas([peca("A", 50)], new Set(["A"]))).toBe(1);
  });

  it("quantidade zerada ou torta ainda rende uma etiqueta", () => {
    expect(contarEtiquetas([peca("A", 0), peca("B", null)])).toBe(2);
  });
});

describe("a recusa por tamanho da seleção", () => {
  const muitas = (n) => [peca("A", n)];

  it("no limite, passa", () => {
    expect(recusaPorTamanho([peca("A", MAX_ETIQUETAS)])).toBeNull();
  });

  it("um a mais, recusa — e diz os dois números", () => {
    const r = recusaPorTamanho(muitas(MAX_ETIQUETAS + 1));
    expect(r.etiquetas).toBe(MAX_ETIQUETAS + 1);
    expect(r.limite).toBe(MAX_ETIQUETAS);
  });

  // ⚠⚠ QUANDO UMA MARCA SOZINHA ESTOURA, "marque por partes" NÃO RESOLVE: a tela seleciona marcas
  // inteiras, não peças. Mandar a pessoa tentar isso é mandá-la bater na parede de novo.
  it("marca indivisível é dita com todas as letras", () => {
    const r = recusaPorTamanho([peca("GIGANTE", MAX_ETIQUETAS + 500)]);
    expect(r.marcaIndivisivel).toBe(true);
    expect(r.erro).toContain("Uma única marca já passa do limite");
  });

  it("muitas marcas pequenas: a saída é filtrar, e a frase diz isso", () => {
    const r = recusaPorTamanho(Array.from({ length: MAX_ETIQUETAS + 10 }, (_, i) => peca(`M${i}`, 1)));
    expect(r.marcaIndivisivel).toBeUndefined();
    expect(r.erro).toContain("Filtre por frente");
  });

  // ⚠ A caixa entra na conta do limite: 3.000 peças numa caixa são 1 etiqueta e têm de passar.
  it("a caixa tira a seleção do limite quando é ela que estourava", () => {
    expect(recusaPorTamanho([peca("A", MAX_ETIQUETAS + 1000)], new Set(["A"]))).toBeNull();
  });
});

describe("a recusa pelos bytes de verdade", () => {
  // ⚠⚠ A CONTAGEM ESTIMA, OS BYTES MEDEM: 2.000 páginas de poucas marcas reusam muito mais imagem
  // que 2.000 marcas de uma página cada. A média de uma obra não vale para as outras.
  it("no limite, passa", () => {
    expect(recusaPorBytes(MAX_BYTES)).toBeNull();
  });

  it("acima, recusa dizendo o tamanho em MB", () => {
    const r = recusaPorBytes(MAX_BYTES + 1_000_000);
    expect(r.erro).toContain("MB");
    expect(r.bytes).toBe(MAX_BYTES + 1_000_000);
  });
});
