import { describe, it, expect } from "vitest";
import { ordemNaFila, daVez, aguardaAVez } from "@/lib/assinatura-fila";
import { linhaFaltamAssinar } from "@/lib/qualidade-campo";

// Geraldo (29/09/2026): "precisa colocar uma lógica para aprovação de relatório: primeiro inspetor,
// depois torg e por último o cliente — exemplo: o Davi recebeu o relatório ao mesmo tempo que eu
// (…) ele abriu e falou: está sem a assinatura de vocês".

const ALEXANDRE = { nome: "Alexandre Stival", email: "stival2112@gmail.com", setor: "Inspetor" };
const GERALDO = { nome: "Geraldo Tank", email: "qualidade@torg.com.br", setor: "Torg Metal" };
const DAVI = { nome: "Davi Pinho", email: "pinho.davi@tmsa.ind.br", setor: "Cliente" };
const ASSINOU = new Date("2026-09-29T17:50:00Z");

describe("a ordem da fila sai do PAPEL, não da linha em que a pessoa foi digitada", () => {
  it("inspetor → Torg Metal → cliente, qualquer que seja a posição no envio", () => {
    expect(ordemNaFila("Inspetor", 2)).toBeLessThan(ordemNaFila("Torg Metal", 0));
    expect(ordemNaFila("Torg Metal", 9)).toBeLessThan(ordemNaFila("Cliente", 0));
  });

  it("maiúscula e acento não mudam o papel", () => {
    expect(ordemNaFila("CLIENTE", 0)).toBe(ordemNaFila("Cliente", 0));
    expect(ordemNaFila("inspetor", 0)).toBe(ordemNaFila("Inspetor", 0));
  });

  it("papel fora do convite vai com a Torg — o cliente é sempre o último", () => {
    for (const papel of ["Fiscalização", null, ""]) {
      expect(ordemNaFila(papel, 0)).toBeGreaterThanOrEqual(ordemNaFila("Torg Metal", 0));
      expect(ordemNaFila(papel, 0)).toBeLessThan(ordemNaFila("Cliente", 0));
    }
  });
});

describe("quem está com a vez", () => {
  const fila = () => [
    { ...DAVI, ordem: 302, assinadoEm: null },
    { ...ALEXANDRE, ordem: 100, assinadoEm: ASSINOU },
    { ...GERALDO, ordem: 201, assinadoEm: null },
  ];

  it("é o primeiro que ainda não assinou", () => {
    expect(daVez(fila()).nome).toBe("Geraldo Tank");
  });

  it("ninguém, quando todos assinaram", () => {
    expect(daVez(fila().map((a) => ({ ...a, assinadoEm: ASSINOU })))).toBeNull();
  });

  it("envio antigo, sem ordem, não tem fila — todos foram convidados juntos", () => {
    expect(daVez([{ ...GERALDO, ordem: null, assinadoEm: null }, { ...DAVI, ordem: null, assinadoEm: null }])).toBeNull();
  });

  it("não reordena a lista de quem chamou", () => {
    const lista = fila();
    daVez(lista);
    expect(lista.map((a) => a.ordem)).toEqual([302, 100, 201]);
  });
});

describe("quem ainda espera a vez", () => {
  it("o cliente espera enquanto a Torg não assinou; depois, não", () => {
    const davi = { ...DAVI, ordem: 302, assinadoEm: null };
    const antes = [{ ...ALEXANDRE, ordem: 100, assinadoEm: ASSINOU }, { ...GERALDO, ordem: 201, assinadoEm: null }, davi];
    expect(aguardaAVez(davi, antes)).toBe(true);
    const depois = [{ ...ALEXANDRE, ordem: 100, assinadoEm: ASSINOU }, { ...GERALDO, ordem: 201, assinadoEm: ASSINOU }, davi];
    expect(aguardaAVez(davi, depois)).toBe(false);
  });

  it("envio antigo, sem ordem, ninguém espera", () => {
    const davi = { ...DAVI, ordem: null, assinadoEm: null };
    expect(aguardaAVez(davi, [{ ...GERALDO, ordem: null, assinadoEm: null }, davi])).toBe(false);
  });

});

// "Falta assinar: Geraldo · Davi" parecia que o convite já tinha ido para o cliente.
describe("a linha de quem falta assinar, na lista e no detalhe", () => {
  it("em fila, diz quem está com a vez — com o e-mail do convite — e quem espera", () => {
    const lista = [
      { ...DAVI, ordem: 302, assinadoEm: null },
      { ...ALEXANDRE, ordem: 100, assinadoEm: ASSINOU },
      { ...GERALDO, ordem: 201, assinadoEm: null },
    ];
    expect(linhaFaltamAssinar(lista)).toBe("Com a vez: Geraldo Tank (qualidade@torg.com.br) · na fila: Davi Pinho");
  });

  it("envio antigo, em paralelo, segue dizendo todos os que faltam", () => {
    const lista = [{ ...GERALDO, ordem: null, assinadoEm: null }, { ...DAVI, ordem: null, assinadoEm: null }];
    expect(linhaFaltamAssinar(lista)).toBe("Falta assinar: Geraldo Tank (qualidade@torg.com.br) · Davi Pinho (pinho.davi@tmsa.ind.br)");
  });

  it("todos assinaram: nada a dizer", () => {
    expect(linhaFaltamAssinar([{ ...GERALDO, ordem: 201, assinadoEm: ASSINOU }])).toBe("");
  });
});
