import { describe, it, expect } from "vitest";
import { obraLiberadaPara, cicloConcluido, documentoDeConsulta } from "@/lib/cliente-relatorios";

// O CLIENTE CONSULTA O RELATÓRIO DEPOIS QUE TODOS ASSINARAM.
//
// Vitor (22/09/2026), sobre o Renato Massano (inspetor de qualidade da TMSA, contato da OP-105):
// "vamos manter assim, apenas deixe disponível para ele consultar quando o Davi assinar". O espaço
// do cliente continua mostrando o que foi ENVIADO para a pessoa assinar; o que entra agora é a
// leitura do que já está fechado, para quem tem a obra liberada.

const contatos = [{ nome: "Renato Massano", email: "massano.renato@gmail.com", funcao: "Inspetor de Qualidade" }];
const op = { clienteEmail: "rogerio.porsch@tmsa.ind.br", clienteContatos: contatos };
const relDe = (assinaturas, status = "EM_ANDAMENTO") => ({
  id: "r1", codigo: "RPM-105-002", tipo: "PRE_MONTAGEM", revisao: 0, opNumero: "105",
  envioAssinatura: { status, titulo: "RPM-105-002 — Inspeção de pré-montagem · OP-105", enviadoEm: new Date("2026-09-21"), assinaturas },
});
const DAVI = { email: "pinho.davi@tmsa.ind.br", assinadoEm: new Date("2026-09-23") };
const TORG = { email: "qualidade@torg.com.br", assinadoEm: new Date("2026-09-21") };

describe("quem tem a obra liberada", () => {
  it("o contato da OP e o e-mail do cadastro — sem ligar para caixa ou espaço", () => {
    expect(obraLiberadaPara(op, "  MASSANO.Renato@gmail.com ")).toBe(true);
    expect(obraLiberadaPara(op, "rogerio.porsch@tmsa.ind.br")).toBe(true);
  });
  it("quem não está na obra não consulta nada dela", () => {
    expect(obraLiberadaPara(op, "outro@cliente.com")).toBe(false);
    expect(obraLiberadaPara(op, "")).toBe(false);
    expect(obraLiberadaPara({}, "massano.renato@gmail.com")).toBe(false);
  });
});

describe("o ciclo de assinatura fechou?", () => {
  it("sim quando todo mundo assinou", () => {
    expect(cicloConcluido({ assinaturas: [TORG, DAVI] })).toBe(true);
  });
  // ⚠⚠ O STATUS É BEST-EFFORT: quem assina grava "CONCLUIDO" num update com `.catch(() => {})`
  // (app/api/assinar/[token]/route.js). Confiar só nele esconderia relatório fechado de verdade.
  it("sim pelo status, mesmo que a gravação das assinaturas venha resumida", () => {
    expect(cicloConcluido({ status: "CONCLUIDO", assinaturas: [] })).toBe(true);
  });
  it("não enquanto falta alguém", () => {
    expect(cicloConcluido({ assinaturas: [TORG, { email: "pinho.davi@tmsa.ind.br", assinadoEm: null }] })).toBe(false);
    expect(cicloConcluido({ assinaturas: [] })).toBe(false);
    expect(cicloConcluido(null)).toBe(false);
  });
  // ⚠ documento devolvido para revisão sobe de revisão e o ciclo recomeça: não é leitura, é rascunho
  it("não quando foi devolvido para revisão, ainda que as assinaturas colhidas estejam lá", () => {
    expect(cicloConcluido({ status: "REVISAO_PEDIDA", assinaturas: [TORG, DAVI] })).toBe(false);
  });
});

describe("o documento que vai para o espaço do cliente", () => {
  it("nasce SÓ LEITURA, sem link de assinar, com a data em que fechou", () => {
    const d = documentoDeConsulta(relDe([TORG, DAVI]));
    expect(d).toMatchObject({ tipo: "RELATORIO_INSPECAO", somenteLeitura: true, link: null, revisao: 0 });
    expect(d.titulo).toContain("RPM-105-002");
    expect(d.pdf).toBe("/api/cliente/relatorio/r1/pdf");
    expect(d.concluidoEm).toEqual(DAVI.assinadoEm); // a última assinatura
    expect(d.assinadoEm).toBe(null); // não é ELE que assinou
  });
  it("não existe enquanto o ciclo não fecha", () => {
    expect(documentoDeConsulta(relDe([TORG, { email: "pinho.davi@tmsa.ind.br", assinadoEm: null }]))).toBe(null);
    expect(documentoDeConsulta({ id: "r2", codigo: "X", envioAssinatura: null })).toBe(null);
  });
});
