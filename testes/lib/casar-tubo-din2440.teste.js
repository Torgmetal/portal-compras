// Tubo de condução sem a parede no perfil. Gabriel (Engenharia, 05/10/2026), na OP-118: a tela de
// Liberar frentes mostrava "não comprado · escolher R" para 616 peças de TB 1.1/4" e TB 3/4" - DIN2440,
// com os dois tubos recebidos no CMR (R 261701 e R 261750) — "o Eduardo recebeu sim, só tá com outro
// nome parece (…) aí no portal não vincula as duas como mesma coisa". A RM T118-001-R00 pediu
// exatamente essas descrições, com material DIN-2440.
//
// O perfil traz bitola e norma, sem parede; o CMR traz bitola, diâmetro externo e parede, sem a norma.
// Sobrava só a bitola (2 pontos, corte em 3). O diâmetro externo da série (1.1/4" = 42,4) confirma
// que é tubo de condução — o estrutural de 1.1/4" tem 31,75 — desde que a descrição não declare
// outra norma.
import { describe, it, expect } from "vitest";
import { casarPerfilComOmie } from "@/lib/casar-omie";

const casa = (perfil, descricao) => casarPerfilComOmie(perfil, [{ codigo: null, descricao }])?.descricao ?? null;

describe("tubo DIN 2440 sem parede no perfil × CMR com diâmetro e parede", () => {
  it("TB 1.1/4\" - DIN2440 casa com o R 261701 da OP-118", () => {
    const d = 'TUBO REDONDO Ø1.1/4" (42,40) X 2,65MM';
    expect(casa('TB 1.1/4" - DIN2440', d)).toBe(d);
  });

  it("TB 3/4\" - DIN2440 casa com o R 261750 da OP-118 (escrito \"2,25M\" no CMR)", () => {
    const d = 'TUBO REDONDO Ø3/4" (26,90) X 2,25M';
    expect(casa('TB 3/4" - DIN2440', d)).toBe(d);
  });

  it("sem o diâmetro da série a bitola sozinha não basta (tubo estrutural de 1.1/4\")", () => {
    expect(casa('TB 1.1/4" - DIN2440', 'TUBO REDONDO 1.1/4" X 1,50MM')).toBeNull();
  });

  it("descrição que declara OUTRA norma não ganha a confirmação (SCH 40 tem o mesmo diâmetro)", () => {
    expect(casa('TB 1.1/4" - DIN2440', 'TUBO ACO CARBONO Ø1.1/4" SCH40 (42,16) X 3,56MM')).toBeNull();
  });

  it("bitola diferente continua não casando", () => {
    expect(casa('TB 1.1/4" - DIN2440', 'TUBO REDONDO Ø1.1/2" (48,30) X 2,65MM')).toBeNull();
  });

  it("perfil COM parede segue a regra antiga: parede diferente não casa, igual casa", () => {
    expect(casa('TB 1.1/2"X2.65 - DIN2440', 'TUBO REDONDO Ø1.1/2" (48,30) X 2,00MM')).toBeNull();
    const d = 'TUBO REDONDO Ø1.1/2" (48,30) X 2,65MM';
    expect(casa('TB 1.1/2"X2.65 - DIN2440', d)).toBe(d);
  });

  // ⚠⚠ Achado do Codex (05/10/2026): a confirmação pelo diâmetro valia para QUALQUER norma do perfil.
  // `TB 1.1/4" - SCH40` passava a casar com um tubo de 42,4 sem norma declarada — material oferecido
  // e validado na liberação sem prova da especificação. O diâmetro só prova a série do DIN 2440.
  it("perfil SCH40 sem parede NÃO ganha a confirmação pelo diâmetro", () => {
    expect(casa('TB 1.1/4" - SCH40', 'TUBO REDONDO Ø1.1/4" (42,40) X 2,65MM')).toBeNull();
  });
  it("perfil NBR sem parede também não", () => {
    expect(casa('TB 1.1/4" - NBR5580', 'TUBO REDONDO Ø1.1/4" (42,40) X 2,65MM')).toBeNull();
  });
});
