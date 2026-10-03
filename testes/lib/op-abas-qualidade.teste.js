// A aba Qualidade da OP tem duas permissões separadas: editar/enviar o PLP e ver os relatórios.
import { describe, it, expect } from "vitest";
import { permissoesQualidadeOP } from "@/lib/op-abas";

const u = (...modulos) => ({ tipo: "USUARIO", modulos });

describe("permissoesQualidadeOP", () => {
  it("produção (o Diego): vê o PLP só em PDF e não pede os relatórios", () =>
    expect(permissoesQualidadeOP(u("PRODUCAO"))).toEqual({ soConsulta: true, verRelatorios: false }));
  it("⚠ qualidade de campo: não edita o PLP, mas continua vendo os relatórios", () =>
    expect(permissoesQualidadeOP(u("QUALIDADE_CAMPO"))).toEqual({ soConsulta: true, verRelatorios: true }));
  it("qualidade: tudo", () => expect(permissoesQualidadeOP(u("QUALIDADE"))).toEqual({ soConsulta: false, verRelatorios: true }));
  it("comercial: edita o PLP como antes; relatórios a rota já recusava", () =>
    expect(permissoesQualidadeOP(u("COMERCIAL"))).toEqual({ soConsulta: false, verRelatorios: false }));
  it("administrador: tudo", () => expect(permissoesQualidadeOP({ tipo: "ADMIN", modulos: [] })).toEqual({ soConsulta: false, verRelatorios: true }));
  it("módulo vindo do banco como objeto", () =>
    expect(permissoesQualidadeOP({ tipo: "USUARIO", modulos: [{ modulo: "QUALIDADE_CAMPO" }] }).verRelatorios).toBe(true));
});
