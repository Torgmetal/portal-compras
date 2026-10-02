// Como a tabela do RUS se reparte pelas folhas, e onde vai o fecho (legenda, observações, instrumentos).
// A verificação de 02/10/2026 achou o fecho contado de cabeça (159 pt fixos): com assinatura desenhada
// ou seis instrumentos ele passava do pé do papel. Agora a conta é feita antes de desenhar — e aqui ela
// é conferida sozinha, sem PDF no meio.
import { describe, it, expect } from "vitest";
import { planejarTabela, H_CAB_TAB, H_LIN, H_AVISO, corDoLaudo } from "@/lib/relatorio-us-tabela-pdf";
import { RED, GREEN, ORANGE, DARK } from "@/lib/relatorio-form-pdf";

const linhas = (n, h = H_LIN) => Array.from({ length: n }, () => h);

describe("planejarTabela", () => {
  it("cabe tudo: uma folha, e linhas em branco preenchem até o fecho", () => {
    const p = planejarTabela(linhas(5), { livre: 300, fresca: 400, fecho: 100 });
    expect(p.segmentos).toEqual([{ novaFolha: false, linhas: [0, 1, 2, 3, 4] }]);
    expect(p.fechoJunto).toBe(true);
    expect(p.brancas).toBe(Math.floor((300 - H_CAB_TAB - 5 * H_LIN - 100) / H_LIN));
  });

  it("linhas demais: a tabela continua na folha seguinte, com o cabeçalho de novo — e o aviso no pé", () => {
    const p = planejarTabela(linhas(30), { livre: 200, fresca: 400, fecho: 100 });
    // a folha que não fecha a tabela guarda H_AVISO para dizer que ela continua
    const naPrimeira = Math.floor((200 - H_CAB_TAB - H_AVISO) / H_LIN);
    expect(p.segmentos[0]).toEqual({ novaFolha: false, linhas: Array.from({ length: naPrimeira }, (_, i) => i) });
    expect(p.segmentos[1].novaFolha).toBe(true);
    expect(p.segmentos.flatMap((s) => s.linhas)).toEqual(Array.from({ length: 30 }, (_, i) => i));
  });

  it("o fecho não cabe depois da última linha: as DUAS últimas vão com ele para a folha nova", () => {
    // 10 linhas ocupam 130 + 34; sobram 36 — o fecho de 100 não cabe
    const p = planejarTabela(linhas(10), { livre: 200, fresca: 400, fecho: 100 });
    expect(p.segmentos).toEqual([{ novaFolha: false, linhas: [0, 1, 2, 3, 4, 5, 6, 7] }, { novaFolha: true, linhas: [8, 9] }]);
    expect(p.fechoJunto).toBe(true);
    expect(p.brancas).toBe(Math.floor((400 - H_CAB_TAB - 2 * H_LIN - 100) / H_LIN));
  });

  it("com menos de três linhas na folha, nenhuma é levada — a folha não fica sem tabela", () => {
    const p = planejarTabela(linhas(2), { livre: H_CAB_TAB + 2 * H_LIN + 10, fresca: 400, fecho: 100 });
    expect(p.segmentos).toEqual([{ novaFolha: false, linhas: [0, 1] }]);
    expect(p.fechoJunto).toBe(false);
  });

  it("fecho maior que uma folha inteira: as linhas ficam onde estão, e o fecho flui depois delas", () => {
    const p = planejarTabela(linhas(10), { livre: 200, fresca: 400, fecho: 900 });
    expect(p.segmentos).toHaveLength(1);
    expect(p.fechoJunto).toBe(false);
    expect(p.brancas).toBe(0);
  });

  it("nem o cabeçalho da tabela com a primeira linha cabe na folha atual: a tabela começa na seguinte", () => {
    const p = planejarTabela(linhas(3), { livre: H_CAB_TAB + 5, fresca: 400, fecho: 100 });
    expect(p.segmentos[0].novaFolha).toBe(true);
  });

  it("tabela sem linha nenhuma sai com ao menos uma linha em branco", () => {
    expect(planejarTabela([], { livre: 300, fresca: 400, fecho: 100 }).brancas).toBeGreaterThanOrEqual(1);
    expect(planejarTabela([], { livre: 60, fresca: 400, fecho: 900 }).brancas).toBe(1);
  });

  it("linha alta (texto quebrado) conta a altura dela, não a de uma linha comum", () => {
    const p = planejarTabela([H_LIN, 41, H_LIN], { livre: H_CAB_TAB + H_LIN + 40, fresca: 400, fecho: 10 });
    expect(p.segmentos.map((s) => s.linhas)).toEqual([[0], [1, 2]]);
  });
});

describe("a cor do laudo", () => {
  it("R vermelho, A verde, REC laranja — REC não é reprovação", () => {
    expect(corDoLaudo("R")).toBe(RED);
    expect(corDoLaudo("a")).toBe(GREEN);
    expect(corDoLaudo("REC")).toBe(ORANGE);
    expect(corDoLaudo("")).toBe(DARK);
  });
});
