// A chave da LPC é a fase, nunca o número da OP — OP-094 (14/09/2026) entrou duas vezes ("094" e "T94A").
import { expect, it } from "vitest";
import { chaveParaOParser, chaveAjustadaPeloBanco, ehSoNumero, faseDoArquivo } from "@/lib/lpc-chave";

it("fase no nome do arquivo manda; a OP escolhida na tela só vale se for fase", () => {
  expect(faseDoArquivo("T94A-LPC_R01.xlsx")).toBe("T94A");
  expect(chaveParaOParser({ arquivoNome: "T94A-LPC_R01.xlsx", opForcada: "094" })).toBe("T94A");
  expect(chaveParaOParser({ arquivoNome: null, opForcada: "T83F" })).toBe("T83F");
  expect(chaveParaOParser({ arquivoNome: null, opForcada: "094" })).toBeNull(); // deixa o parser achar pela marca
  expect(chaveParaOParser({ arquivoNome: "lista.xlsx", opForcada: "94" })).toBeNull();
});

it("chave só numérica com UMA lista já gravada sob a fase: usa a fase; com duas fases não adivinha", () => {
  expect(chaveAjustadaPeloBanco("094", ["T94A"])).toBe("T94A");
  expect(chaveAjustadaPeloBanco("083", ["T83F", "T83D"])).toBeNull();
  expect(chaveAjustadaPeloBanco("T94A", ["T94A"])).toBeNull();
  expect(chaveAjustadaPeloBanco("094", [])).toBeNull();
  expect(ehSoNumero("094")).toBe(true); expect(ehSoNumero("T94A")).toBe(false);
});
