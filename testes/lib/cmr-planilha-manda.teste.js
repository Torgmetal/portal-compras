import { describe, it, expect, vi } from "vitest";
import { ehOutroMaterial, montarPatch } from "@/lib/cmr-reconciliar";
import { proximoIndiceR } from "@/lib/cmr";
import { prisma } from "@/lib/prisma";

// ─── A PLANILHA MANDA, E O R PRECISA ESTAR LIVRE NOS DOIS LADOS ───────────────
//
// ⚠⚠ O CASO REAL (R 261547, 22/09/2026): o índice nasceu no portal como uma PORCA (série RC), a
// planilha trouxe uma CHAPA com o MESMO número, e a regra de então — "preenche só o campo vazio,
// o portal manda" — completou a PORCA com o CERTIFICADO e a CORRIDA da CHAPA. Identidade de um
// material com a rastreabilidade de outro, no campo que o data book leva ao cliente.

describe("ehOutroMaterial — trocar de dono é diferente de ganhar detalhe", () => {
  it("PORCA virando CHAPA é troca de material", () => {
    expect(ehOutroMaterial("PORCA A563 - 3/8\" - GF", "CHAPA ACO CARBONO LAMINADO A-36 9,50MM")).toBe(true);
  });

  // ⚠⚠ AS DUAS PRIMEIRAS "TROCAS" REAIS FORAM ALARME FALSO (medido em 22/09/2026). Isto importa
  // porque troca de material LIMPA os campos que a planilha não traz: chamar uma correção de
  // descrição de "troca" apagaria o certificado de um material que está certo.
  it("mesmo certificado = descrição corrigida, não troca (caso 260954)", () => {
    expect(ehOutroMaterial(
      "CHAPA ACO CARBONO LAMINADO A-36 ESPESSURA 4,75MM",
      "PERFIL DOBRADO UDCE 150x60x20x4,75",
      { certificadoAntes: "8195", certificadoDepois: "8195" },
    )).toBe(false);
  });

  it("mesma corrida também desempata", () => {
    expect(ehOutroMaterial("CHAPA A-36", "PERFIL UDCE",
      { corridaAntes: "2816092232", corridaDepois: "2816092232" })).toBe(false);
  });

  // ⚠ Dois vazios não provam nada — aí vale o texto.
  it("sem certificado dos dois lados, quem decide é o nome", () => {
    expect(ehOutroMaterial("PORCA A563", "CHAPA A-36",
      { certificadoAntes: "", certificadoDepois: "" })).toBe(true);
  });

  // ⚠ "A CONFIRMAR" é casca com texto: o almoxarifado reserva o R antes de saber o que chegou.
  it.each(["ITEM A CONFIRMAR COM COMPRAS", "MATERIAL A DEFINIR"])(
    "%s sendo preenchido não é troca", (antes) => {
      expect(ehOutroMaterial(antes, "QUADRADO LAM. 1.1/2 X 6MTS")).toBe(false);
    });

  // ⚠ Preencher a casca é o fluxo NORMAL — tratar como troca encheria o alerta de ruído, e alarme
  // cheio de ruído ninguém lê.
  it("casca sendo preenchida não é troca", () => {
    expect(ehOutroMaterial("(sem descrição)", "CHAPA ACO CARBONO A-36 9,50MM")).toBe(false);
    expect(ehOutroMaterial("", "CHAPA A-36")).toBe(false);
  });

  // ⚠ A comparação é pelo substantivo do material: bitola, acabamento e grafia mudam sem trocar
  // de dono.
  it.each([
    ["CHAPA ACO CARBONO A-36 9,50MM", "CHAPA ACO CARBONO LAMINADO A-36 ESPESSURA 9,50MM"],
    ["PORCA A563 3/8", "PORCA A563 - 3/8\" - GF"],
    ["PERFIL W 200X26,6", "Perfil W 250x25,3"],
  ])("%s → %s não é troca", (a, b) => expect(ehOutroMaterial(a, b)).toBe(false));
});

describe("proximoIndiceR — conta os dois lados", () => {
  const comPortal = (ultimo) => {
    vi.spyOn(prisma.documentoQualidade, "findFirst").mockResolvedValue(ultimo ? { importRef: ultimo } : null);
  };

  // ⚠⚠ ERA METADE DO DEFEITO: a planilha tem linhas que o portal NÃO importa (a "casca", o R
  // reservado sem descrição), então o maior do portal fica atrás do maior da planilha — e o
  // próximo número emitido já estava ocupado lá.
  it("pula à frente do maior da PLANILHA, mesmo com o portal atrás", async () => {
    comPortal("261400");
    expect(await proximoIndiceR(2026, ["261547", "261548"])).toBe("261549");
  });

  it("sem planilha na conta, volta a enxergar meio mundo — e é por isso que ela é obrigatória", async () => {
    comPortal("261400");
    expect(await proximoIndiceR(2026)).toBe("261401");
  });

  // ⚠ Buraco na numeração da planilha NÃO é vaga: aquele R pode estar reservado como casca.
  it("pula número ocupado mesmo abaixo do maior", async () => {
    comPortal("261548");
    expect(await proximoIndiceR(2026, ["261549", "261550"])).toBe("261551");
  });

  it("ano vazio nos dois lados começa em 0001", async () => {
    comPortal(null);
    expect(await proximoIndiceR(2026, [])).toBe("260001");
  });

  // ⚠ Índice de OUTRO ano na planilha não empurra a numeração deste.
  it("índice de outro ano não conta", async () => {
    comPortal("260010");
    expect(await proximoIndiceR(2026, ["259999", "251000"])).toBe("260011");
  });
});

describe("montarPatch — o que a planilha manda gravar", () => {
  const PORCA = {
    nome: 'PORCA A563 - 3/8" - GF', numeroDocumento: "79475", numeroCorrida: "887182294",
    norma: "NBR 11889", pedidoCompra: "1916", opNumero: "097", fornecedor: "R SIMIONI",
    nfNumero: "368301", observacao: "Tipo: RC", dataRecebimento: null, pesoKg: null, quantidade: null,
  };

  // ⚠⚠ O DEFEITO VOLTANDO PELA OUTRA PORTA (achado do Codex, 22/09/2026). "Célula vazia não apaga"
  // vale enquanto é o MESMO material sendo completado. Quando o índice troca de dono, o certificado
  // e a corrida que lá estavam são de OUTRA coisa — mantê-los recria o híbrido que se está
  // consertando: uma CHAPA com o certificado da PORCA.
  it("troca de material LIMPA o que a planilha não traz", () => {
    const daPlanilha = {
      nome: "CHAPA ACO CARBONO A-36 9,50MM", pedidoCompra: "1982", observacao: "Tipo: R",
      numeroDocumento: "", numeroCorrida: null, norma: "", opNumero: "", fornecedor: null,
      nfNumero: "", dataRecebimento: null, pesoKg: null, quantidade: null,
    };
    const patch = montarPatch(PORCA, daPlanilha, true);
    expect(patch.nome).toBe("CHAPA ACO CARBONO A-36 9,50MM");
    expect(patch.numeroDocumento).toBeNull();
    expect(patch.numeroCorrida).toBeNull();
    expect(patch.opNumero).toBeNull();
    expect(patch.fornecedor).toBeNull();
    expect(patch.nfNumero).toBeNull();
  });

  // ⚠ Sem troca, célula vazia continua não apagando: "o correto é o que foi lançado na planilha"
  // fala do que ESTÁ lá, não do que ainda falta.
  it("MESMO material: célula vazia não apaga", () => {
    const daPlanilha = { ...PORCA, numeroDocumento: "", pesoKg: 120 };
    const patch = montarPatch(PORCA, daPlanilha, false);
    expect(patch.numeroDocumento).toBeUndefined();
    expect(patch.pesoKg).toBe(120);
  });

  // ⚠⚠ A SÉRIE ENTROU NA RECONCILIAÇÃO. Sem isso a PORCA virava CHAPA mantendo "Tipo: RC" — o
  // registro dizia uma coisa no nome e outra na série.
  it("a série R/RC vem da planilha", () => {
    const patch = montarPatch(PORCA, { ...PORCA, nome: "CHAPA A-36", observacao: "Tipo: R" }, true);
    expect(patch.observacao).toBe("Tipo: R");
  });

  it("nada a fazer quando já está igual", () => {
    expect(Object.keys(montarPatch(PORCA, { ...PORCA }, false))).toHaveLength(0);
  });

  // ⚠ O nome nunca é apagado: linha sem descrição não chega a ser reconciliada.
  it("nome vazio na planilha não apaga o nome", () => {
    const patch = montarPatch(PORCA, { ...PORCA, nome: "" }, true);
    expect(patch.nome).toBeUndefined();
  });

  it("data igual não vira patch", () => {
    const d = new Date("2026-09-19T12:00:00Z");
    const patch = montarPatch({ ...PORCA, dataRecebimento: d }, { ...PORCA, dataRecebimento: new Date(d) }, false);
    expect(patch.dataRecebimento).toBeUndefined();
  });
});
