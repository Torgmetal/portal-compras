// Regras do roteiro de 6 etapas: tabela de casos por regra.
import { describe, expect, it } from "vitest";
import { ETAPAS, STATUS, podeMudar } from "@/lib/roteiro-engenharia";

const r = (etapa, status, fase = null) => ({ etapa, fase, status });
const feitas123 = [r(1, "CONCLUIDA"), r(2, "NAO_SE_APLICA"), r(3, "CONCLUIDA")];
const div = (situacao, id = "d1") => ({ id, descricao: "x", fonte: "ifc", evidencia: null, situacao });

describe("constantes", () => {
  it("6 etapas e 5 status", () => { expect(ETAPAS).toHaveLength(6); expect(STATUS).toHaveLength(5); });
});

describe("regra 1: NAO_SE_APLICA só nas etapas 2 e 6", () => {
  it.each([[1, false], [2, true], [3, false], [6, true]])("etapa %i -> %s", (etapa, ok) => {
    const reg = [r(1, "CONCLUIDA"), r(2, "CONCLUIDA"), r(3, "CONCLUIDA")];
    const res = podeMudar(etapa === 1 ? [] : reg, { etapa, fase: null, para: "NAO_SE_APLICA" });
    expect(res.ok).toBe(ok);
    if (!ok) expect(res.motivo).toMatch(/não se aplica/i);
  });
  it("etapa 4 nunca", () => { expect(podeMudar(feitas123, { etapa: 4, fase: 1, para: "NAO_SE_APLICA" }).ok).toBe(false); });
});

describe("regra 2: sair de PENDENTE exige a anterior", () => {
  it("etapa 1 sai livre", () => { expect(podeMudar([], { etapa: 1, para: "EM_ANDAMENTO" }).ok).toBe(true); });
  it("etapa 2 sem a 1 concluída é recusada", () => {
    const res = podeMudar([r(1, "EM_ANDAMENTO")], { etapa: 2, para: "EM_ANDAMENTO" });
    expect(res.ok).toBe(false); expect(res.motivo).toMatch(/etapa 1/);
  });
  it("etapa 3 passa com 2 em NAO_SE_APLICA", () => {
    expect(podeMudar([r(1, "CONCLUIDA"), r(2, "NAO_SE_APLICA")], { etapa: 3, para: "EM_ANDAMENTO" }).ok).toBe(true);
  });
  it("etapa 4 fase 1 exige 1-3 da obra", () => {
    expect(podeMudar([r(1, "CONCLUIDA")], { etapa: 4, fase: 1, para: "EM_ANDAMENTO" }).ok).toBe(false);
    expect(podeMudar(feitas123, { etapa: 4, fase: 1, para: "EM_ANDAMENTO" }).ok).toBe(true);
  });
  it("etapa 5 fase f exige 4 da MESMA fase concluída", () => {
    const reg = [...feitas123, r(4, "CONCLUIDA", 1), r(4, "EM_ANDAMENTO", 2)];
    expect(podeMudar(reg, { etapa: 5, fase: 1, para: "EM_ANDAMENTO" }).ok).toBe(true);
    expect(podeMudar(reg, { etapa: 5, fase: 2, para: "EM_ANDAMENTO" }).ok).toBe(false);
  });
  it("etapa 6 fase f exige 5 da mesma fase concluída", () => {
    const reg = [...feitas123, r(5, "CONCLUIDA", 1), r(5, "AGUARDANDO_ACEITE", 2)];
    expect(podeMudar(reg, { etapa: 6, fase: 1, para: "EM_ANDAMENTO" }).ok).toBe(true);
    expect(podeMudar(reg, { etapa: 6, fase: 2, para: "EM_ANDAMENTO" }).ok).toBe(false);
  });
  it("já fora de PENDENTE, a regra não se repete", () => {
    expect(podeMudar([r(2, "EM_ANDAMENTO")], { etapa: 2, para: "AGUARDANDO_ACEITE" }).ok).toBe(true);
  });
  it("etapa por fase exige fase; etapa da obra recusa fase", () => {
    expect(podeMudar(feitas123, { etapa: 4, fase: null, para: "EM_ANDAMENTO" }).ok).toBe(false);
    expect(podeMudar([], { etapa: 1, fase: 2, para: "EM_ANDAMENTO" }).ok).toBe(false);
  });
});

describe("regra 3: CONCLUIDA só via AGUARDANDO_ACEITE e sem divergência em aberto", () => {
  it("de EM_ANDAMENTO é recusada", () => {
    const res = podeMudar([r(1, "EM_ANDAMENTO")], { etapa: 1, para: "CONCLUIDA" });
    expect(res.ok).toBe(false); expect(res.motivo).toMatch(/aceite/i);
  });
  it("de AGUARDANDO_ACEITE sem divergências passa", () => {
    expect(podeMudar([r(1, "AGUARDANDO_ACEITE")], { etapa: 1, para: "CONCLUIDA" }).ok).toBe(true);
  });
  it("aberta e nao_verificada voltam em pendentes; resolvida e aceita não", () => {
    const ds = [div("aberta", "a"), div("nao_verificada", "b"), div("resolvida", "c"), div("aceita", "d")];
    const res = podeMudar([r(1, "AGUARDANDO_ACEITE")], { etapa: 1, para: "CONCLUIDA", divergencias: ds });
    expect(res.ok).toBe(false); expect(res.pendentes.map((d) => d.id)).toEqual(["a", "b"]);
    expect(podeMudar([r(1, "AGUARDANDO_ACEITE")], { etapa: 1, para: "CONCLUIDA", divergencias: ds.slice(2) }).ok).toBe(true);
  });
});

describe("regra 5: etapa 6 NAO_SE_APLICA vale para a obra", () => {
  it("com fase é recusada; sem fase passa", () => {
    expect(podeMudar(feitas123, { etapa: 6, fase: 1, para: "NAO_SE_APLICA" }).ok).toBe(false);
    expect(podeMudar(feitas123, { etapa: 6, fase: null, para: "NAO_SE_APLICA" }).ok).toBe(true);
  });
  it("encerrado o roteiro, nenhuma fase da etapa 6 anda", () => {
    const reg = [...feitas123, r(5, "CONCLUIDA", 1), r(6, "NAO_SE_APLICA")];
    const res = podeMudar(reg, { etapa: 6, fase: 1, para: "EM_ANDAMENTO" });
    expect(res.ok).toBe(false); expect(res.motivo).toMatch(/encerrad/i);
  });
});
