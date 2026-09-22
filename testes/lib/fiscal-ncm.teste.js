import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {}, prismaDirect: {} }));
import { lerNcm, dataBr } from "@/lib/fiscal/importar-ncm";

// ─── A TABELA NCM DO SISCOMEX ────────────────────────────────────────────────
//
// ⚠ Fixtures são recortes do JSON real (15.156 registros, `Resolução Gecex nº 926/2026`, medido em
// 22/09/2026). Diferente da TIPI, esta fonte DECLARA a própria vigência por código.

describe("dataBr — a vigência que a fonte declara", () => {
  it("dd/mm/aaaa vira Date em UTC", () => {
    // ⚠⚠ UTC, NÃO SÃO PAULO. Isto é VIGÊNCIA — um dia do calendário legal — e não o carimbo de
    // quando algo aconteceu. Meia-noite em São Paulo é o dia ANTERIOR em UTC, e foi exatamente
    // assim que o prazo do fornecedor já apareceu um dia antes do digitado neste projeto.
    expect(dataBr("01/04/2022").toISOString()).toBe("2022-04-01T00:00:00.000Z");
  });

  // ⚠⚠ "31/12/9999" É O JEITO DO SISCOMEX DIZER "SEM FIM". Guardado como data, a tela mostraria
  // "vigente até 31/12/9999", que é ruído — e qualquer conta de intervalo estouraria.
  it("31/12/9999 é ausência de fim, não uma data", () => {
    expect(dataBr("31/12/9999")).toBeNull();
  });

  it.each(["", null, undefined, "2022-04-01", "abril de 2022", "32/13/2022"])(
    "%s não vira data", (v) => expect(dataBr(v)).toBeNull());
});

describe("lerNcm — códigos, hierarquia e ato", () => {
  const json = (...n) => ({ Nomenclaturas: n });
  const reg = (Codigo, Descricao, extra = {}) => ({
    Codigo, Descricao, Data_Inicio: "01/04/2022", Data_Fim: "31/12/9999",
    Tipo_Ato_Ini: "Res Gecex", Numero_Ato_Ini: "272", Ano_Ato_Ini: "2021", ...extra,
  });

  // ⚠ A lista traz os NÍVEIS junto das folhas — "01", "01.01" e "0101.21.00" convivem. Guardar só
  // as de 8 dígitos jogaria fora a hierarquia que dá sentido à descrição, como na TIPI.
  it("guarda hierarquia e folha, normalizando o código", () => {
    const { itens, problemas } = lerNcm(json(
      reg("01", "Animais vivos."),
      reg("01.01", "Cavalos, asininos e muares, vivos."),
      reg("0101.21.00", "-- Reprodutores de raça pura"),
    ));
    expect(problemas).toEqual([]);
    expect(itens.map((i) => i.codigo)).toEqual(["01", "0101", "01012100"]);
    expect(itens[2].codigoFormatado).toBe("0101.21.00");
  });

  it("a vigência e o ato vêm da própria fonte", () => {
    const [i] = lerNcm(json(reg("8437.90.00", "- Partes"))).itens;
    expect(i.vigenciaInicio.toISOString().slice(0, 10)).toBe("2022-04-01");
    expect(i.vigenciaFim).toBeNull();
    expect([i.atoTipo, i.atoNumero, i.atoAno]).toEqual(["Res Gecex", "272", "2021"]);
  });

  // ⚠ Registro sem código ou sem descrição é denunciado, não engolido: é sinal de que o formato
  // do Siscomex mudou, e descobrir isso meses depois seria pior.
  it("registro incompleto vira problema", () => {
    const { itens, problemas } = lerNcm(json(
      reg("8437.90.00", "- Partes"),
      { Codigo: "", Descricao: "sem código" },
      { Codigo: "7325.99.90", Descricao: "" },
    ));
    expect(itens).toHaveLength(1);
    expect(problemas).toHaveLength(2);
  });

  it("lista ausente não estoura — devolve vazio", () => {
    expect(lerNcm(undefined).itens).toEqual([]);
    expect(lerNcm({}).itens).toEqual([]);
  });
});
