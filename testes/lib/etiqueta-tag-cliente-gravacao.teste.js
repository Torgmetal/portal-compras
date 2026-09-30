// A importação das TAGs da OP-105 estourou o tempo da Vercel (Matheus, 30/09/2026: "resposta 504 —
// FUNCTION_INVOCATION_TIMEOUT"). Eram 1.663 upserts, um por unidade, numa transação interativa —
// uma ida ao banco por peça. Agora são DOIS comandos, qualquer que seja o tamanho da planilha.
import { describe, it, expect, vi } from "vitest";
import { salvarTagsCliente } from "@/lib/etiqueta-tag-cliente";

const db = () => ({
  $executeRawUnsafe: vi.fn(async (sql) => (/^\s*UPDATE/.test(sql) ? 1663 : 1669)),
  $transaction: vi.fn(async (ops) => Promise.all(ops)),
});

const unidades = (n) => Array.from({ length: n }, (_, i) => ({ marca: `105A${i % 96}`, unidade: Math.floor(i / 96) + 1, tag: "TC 4706" }));

describe("salvarTagsCliente — em lote", () => {
  it("⚠⚠ 1.663 unidades = 2 comandos numa transação, não 1.663 idas ao banco", async () => {
    const d = db();
    const r = await salvarTagsCliente(d, "105", unidades(1663));
    expect(d.$transaction).toHaveBeenCalledTimes(1);
    expect(d.$executeRawUnsafe).toHaveBeenCalledTimes(2);
    expect(r).toEqual({ gravadas: 1669, zeradas: 1663 });
  });

  it("zera a TAG da OP antes de gravar — substitui, não soma (e só o campo tagCliente)", async () => {
    const d = db();
    await salvarTagsCliente(d, "105", unidades(3));
    const [zerar, gravar] = d.$executeRawUnsafe.mock.calls;
    expect(zerar[0]).toMatch(/UPDATE "EtiquetaCampoExtra" SET "tagCliente" = NULL/);
    expect(zerar[1]).toBe("105");
    expect(gravar[0]).toMatch(/ON CONFLICT \("opNumero","marca","unidade"\) DO UPDATE SET "tagCliente" = EXCLUDED."tagCliente"/);
    // ⚠ nunca toca nos campos do QWS da mesma linha
    expect(gravar[0]).not.toMatch(/tagPetrobras|referencia|descricao/);
  });

  it("⚠ SQL constante: os dados vão em arrays-literais de texto, com aspas e barra escapadas", async () => {
    const d = db();
    await salvarTagsCliente(d, "105", [{ marca: 'A"1', unidade: 2, tag: "TC\\4706" }]);
    const gravar = d.$executeRawUnsafe.mock.calls[1];
    expect(gravar.slice(1)).toEqual(["105", '{"A\\"1"}', '{"2"}', '{"TC\\\\4706"}']);
    const outro = db();
    await salvarTagsCliente(outro, "102", unidades(10));
    expect(outro.$executeRawUnsafe.mock.calls[1][0]).toBe(gravar[0]);
  });

  it("nada para gravar não zera nada", async () => {
    const d = db();
    expect(await salvarTagsCliente(d, "105", [])).toEqual({ erro: "Nada para gravar." });
    expect(d.$transaction).not.toHaveBeenCalled();
  });
});
