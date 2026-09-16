// ⚠⚠ `<input type="date">` MOSTRA NO FORMATO DO NAVEGADOR, NÃO NO DA PÁGINA. Medido em 15/09/2026:
// nem `lang="pt-BR"` no input, nem no pai, nem o locale da página mudam — o formato vem do idioma
// da INTERFACE do navegador. Num portal inteiro em português, quem tem o navegador em inglês via
// `mm/dd/yyyy`; e no portal do FORNECEDOR uma data lida ao contrário vira prazo de entrega errado.
import { describe, it, expect } from "vitest";
import { isoParaBR, mascararDataBR, brParaIso } from "@/lib/data-digitada";

describe("isoParaBR", () => {
  it("converte o ISO que circula no portal", () => {
    expect(isoParaBR("2026-09-15")).toBe("15/09/2026");
    expect(isoParaBR("2026-09-15T12:00:00Z")).toBe("15/09/2026");
  });
  it("o que não é data vira vazio, não 'NaN/NaN/'", () => {
    for (const v of ["", null, undefined, "15/09/2026", "abc", "2026-9-5"]) expect(isoParaBR(v)).toBe("");
  });
});

describe("mascararDataBR", () => {
  it("põe as barras conforme se digita", () => {
    expect(mascararDataBR("1")).toBe("1");
    expect(mascararDataBR("15")).toBe("15");
    expect(mascararDataBR("1509")).toBe("15/09");
    expect(mascararDataBR("15092026")).toBe("15/09/2026");
  });
  it("aceita quem digita as barras junto", () => {
    expect(mascararDataBR("15/09/2026")).toBe("15/09/2026");
  });
  it("ignora letra e corta o que passa de oito dígitos", () => {
    expect(mascararDataBR("15a09b2026999")).toBe("15/09/2026");
  });
  // ⚠⚠ Um ISO colado (de um relatório, de uma planilha, do próprio banco) É uma data. Sem tratar,
  // os dígitos entravam na ordem errada e viravam "20/26/0920" — recusada em silêncio.
  it("ISO colado no campo vira a data certa", () => {
    expect(mascararDataBR("2026-09-20")).toBe("20/09/2026");
    expect(brParaIso(mascararDataBR("2026-09-20"))).toBe("2026-09-20");
    expect(mascararDataBR("2026-09-20T12:00:00Z")).toBe("20/09/2026");
  });

  // ⚠ Apagar tem de funcionar: quem volta para corrigir o mês passa por "15/0" e "15/".
  it("os estados de quem está apagando sobrevivem", () => {
    expect(mascararDataBR("15/0")).toBe("15/0");
    expect(mascararDataBR("15/")).toBe("15");
    expect(mascararDataBR("")).toBe("");
  });
});

describe("brParaIso", () => {
  it("converte a data completa", () => {
    expect(brParaIso("15/09/2026")).toBe("2026-09-15");
    expect(brParaIso("01/01/2026")).toBe("2026-01-01");
  });
  it("data incompleta ainda não vale", () => {
    for (const v of ["", "15", "15/09", "15/09/202"]) expect(brParaIso(v)).toBe("");
  });
  // ⚠⚠ CONFERE O CALENDÁRIO, NÃO SÓ O FORMATO: 31/02 casa com a máscara e não existe. Sem esta
  // volta pelo `Date`, viraria 03/03 sozinho — três dias de prazo que ninguém digitou.
  it("data que não existe é recusada, não corrigida em silêncio", () => {
    for (const v of ["31/02/2026", "32/01/2026", "15/13/2026", "00/09/2026", "15/00/2026"]) {
      expect(brParaIso(v)).toBe("");
    }
  });
  it("29 de fevereiro só existe em ano bissexto", () => {
    expect(brParaIso("29/02/2024")).toBe("2024-02-29");
    expect(brParaIso("29/02/2026")).toBe("");
  });
  it("a volta é sempre a mesma data", () => {
    for (const iso of ["2026-09-15", "2024-02-29", "2026-12-31"]) {
      expect(brParaIso(isoParaBR(iso))).toBe(iso);
    }
  });
});
