import { BANCADAS, MONTADOR_DA_BANCADA } from "./montagem-capacidade";

// Postos observados no MES, incluindo os de uso eventual. Não é uma escala de
// pessoal nem altera as cinco bancadas usadas na régua de capacidade.
export const BANCADAS_CONSULTA_MONTAGEM = [
  ...BANCADAS,
  "MONTAGEM 6",
  "MONTAGEM 7",
  "MONTAGEM 9",
  "MONTAGEM 10",
];
export function rotuloPosto(recurso) {
  if (!recurso) return "Sem posto definido";
  const nome =
    MONTADOR_DA_BANCADA[recurso] ||
    (recurso === "MONTAGEM 10" ? "Marcos Bahia" : null);
  const posto = recurso.replaceAll("_", " ");
  return nome ? `${nome} · ${posto}` : posto;
}
