import { describe, it, expect } from "vitest";
import { catalogoDeRegras, regraPorId, impressao } from "@/lib/fiscal/catalogo-regras";
import { SITUACAO, situacaoDaRegra, situacaoDoConjunto } from "@/lib/fiscal/politica-regras";
import { CFOPS, OPERACOES } from "@/lib/fiscal/cfop";
import { simular } from "@/lib/fiscal/simulador";

// ─── O REGISTRO DE VALIDAÇÃO DAS REGRAS ──────────────────────────────────────
//
// ⚠⚠ AS REGRAS CONTINUAM EM CÓDIGO. O briefing pede um "motor de regras em tabela"; o que entrou
// foi a VALIDAÇÃO em tabela, e a diferença é deliberada: regra em banco sai do alcance do PR, do
// lint, do teste e da revisão, e uma linha errada passaria a mudar em silêncio o que o portal manda
// emitir — o oposto de *"NÃO INVENTE REGRAS"*. Autoria de regra pela contabilidade fica fora.

const regra = (over = {}) => ({ id: "cfop:5101", titulo: "5.101 — Venda de produção do estabelecimento", impressao: "abc123", ...over });
const decisao = (over = {}) => ({ estado: SITUACAO.VALIDADA, impressao: "abc123", porNome: "Eduarda", em: new Date("2026-09-23"), ...over });

describe("o catálogo", () => {
  it("cobre os CFOPs, as etapas das cadeias e os cenários de CST", () => {
    const c = catalogoDeRegras();
    const porTipo = (t) => c.filter((r) => r.tipo === t).length;
    expect(porTipo("cfop")).toBe(CFOPS.length);
    expect(porTipo("etapa")).toBe(OPERACOES.reduce((s, o) => s + (o.notas ?? []).length, 0));
    expect(porTipo("cenario")).toBeGreaterThan(0);
  });

  // ⚠⚠ ID REPETIDO FARIA A CONFERÊNCIA DE UMA REGRA VALER PELA OUTRA — `catalogoDeRegras` lança.
  it("não tem id repetido", () => {
    const ids = catalogoDeRegras().map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // ⚠⚠ O ID NÃO PODE SER A POSIÇÃO NO ARRAY (parecer do Codex): inserir uma etapa no meio da
  // cadeia renumeraria todas e transferiria a conferência de uma etapa para outra, em silêncio.
  it("o id da etapa sai do conteúdo, não da ordem", () => {
    const id = regraPorId("etapa:indust-mp-cliente:CLIENTE:5949-6949:REMESSA-SIMBOLICA-DOS-INSUMOS-A-TORG")
      ?? catalogoDeRegras().find((r) => r.tipo === "etapa" && r.conteudo.quem === "Cliente" && r.conteudo.operacao === "indust-mp-cliente");
    expect(id).toBeTruthy();
    expect(id.id).not.toMatch(/:\d+$/);
  });

  it("a impressão digital é determinística e não depende da ordem das chaves", () => {
    expect(impressao({ a: 1, b: [2, 3] })).toBe(impressao({ b: [2, 3], a: 1 }));
  });

  it("mudar o conteúdo muda a impressão", () => {
    expect(impressao({ resumo: "Venda" })).not.toBe(impressao({ resumo: "Venda." }));
  });

  it("cada regra leva na tela o que a contabilidade vai conferir", () => {
    for (const r of catalogoDeRegras()) {
      expect(r.titulo, r.id).toBeTruthy();
      expect(r.impressao, r.id).toHaveLength(16);
    }
  });
});

describe("o que pode ser recomendado", () => {
  // ⚠⚠ PENDENTE NÃO BLOQUEIA, E ISSO É DECISÃO. Todas as regras estão sem conferência hoje:
  // bloquear o pendente desligaria o módulo no dia em que subisse.
  it("sem decisão, a regra é PENDENTE e continua orientando — mas a tela diz que não foi conferida", () => {
    const s = situacaoDaRegra(regra(), undefined);
    expect(s.situacao).toBe(SITUACAO.PENDENTE);
    expect(s.bloqueada).toBe(false);
    expect(s.motivo).toContain("não foi conferido pela contabilidade");
  });

  it("validada na mesma versão leva o nome de quem conferiu", () => {
    const s = situacaoDaRegra(regra(), decisao({ fonte: "Convênio s/nº de 15/12/1970" }));
    expect(s.situacao).toBe(SITUACAO.VALIDADA);
    expect(s.motivo).toContain("Eduarda");
    expect(s.motivo).toContain("Convênio");
  });

  // ⚠⚠ CONFERÊNCIA É DE UMA VERSÃO: herdar seria atestar um texto que ninguém leu.
  it("conteúdo alterado depois da conferência vira ALTERADA, não VALIDADA", () => {
    const s = situacaoDaRegra(regra({ impressao: "NOVO" }), decisao());
    expect(s.situacao).toBe(SITUACAO.ALTERADA);
    expect(s.bloqueada).toBe(false);
    expect(s.motivo).toContain("mudou depois");
  });

  it("contestada bloqueia e diz por quê", () => {
    const s = situacaoDaRegra(regra(), decisao({ estado: SITUACAO.CONTESTADA, ressalva: "o resumo não bate com o Convênio" }));
    expect(s.bloqueada).toBe(true);
    expect(s.motivo).toContain("não bate com o Convênio");
    // ⚠ A ressalva entra pontuada: sem isso a frase saía "…Convênio Enquanto isso…".
    expect(s.motivo).toContain("Convênio. Enquanto");
  });

  // ⚠⚠ EDITAR NÃO APAGA CONTESTAÇÃO (parecer do Codex): senão um ajuste de vírgula silenciaria
  // quem disse que a regra está errada.
  it("contestada continua bloqueando mesmo com o conteúdo alterado", () => {
    const s = situacaoDaRegra(regra({ impressao: "OUTRO" }), decisao({ estado: SITUACAO.CONTESTADA }));
    expect(s.situacao).toBe(SITUACAO.CONTESTADA);
    expect(s.bloqueada).toBe(true);
  });

  // ⚠⚠ AQUI A FALHA DE LEITURA BLOQUEIA — é o inverso do resto do módulo, e é o inverso que protege.
  it("registro indisponível suspende a orientação, não a libera", () => {
    const s = situacaoDaRegra(regra(), undefined, { disponivel: false });
    expect(s.situacao).toBe(SITUACAO.INDISPONIVEL);
    expect(s.bloqueada).toBe(true);
    expect(s.motivo).toContain("suspensa");
  });
});

describe("o conjunto de regras de um resultado", () => {
  // ⚠⚠ APROVAR O CFOP NÃO APROVA O CST NEM A CADEIA.
  it("uma bloqueada derruba o conjunto, e o motivo diz qual", () => {
    const c = situacaoDoConjunto([
      situacaoDaRegra(regra({ id: "cfop:5101" }), decisao()),
      situacaoDaRegra(regra({ id: "cenario:VENDA", titulo: "CST da família Venda" }), decisao({ estado: SITUACAO.CONTESTADA })),
    ]);
    expect(c.bloqueada).toBe(true);
    // ⚠ O alerta usa o TÍTULO, nunca o id interno — quem lê quer saber qual operação parou.
    expect(c.motivo).toContain("CST da família Venda");
    expect(c.motivo).not.toContain("cenario:VENDA");
  });

  it("“tudo conferido” exige TODAS validadas — uma pendente derruba a frase", () => {
    const c = situacaoDoConjunto([
      situacaoDaRegra(regra({ id: "a" }), decisao()),
      situacaoDaRegra(regra({ id: "b" }), undefined),
    ]);
    expect(c.todasValidadas).toBe(false);
    expect(c.bloqueada).toBe(false);
    expect(c.pendentes).toBe(1);
  });

  it("conjunto vazio não é “tudo conferido”", () => {
    expect(situacaoDoConjunto([]).todasValidadas).toBe(false);
  });
});

// ─── A INTEGRAÇÃO COM O SIMULADOR ────────────────────────────────────────────
//
// ⚠⚠ TARJA NÃO BASTA (parecer do Codex): a ficha é o bloco que a pessoa COPIA para o Omie, e ela
// seria copiada com a tarja para trás. Regra contestada não entrega ficha.
describe("a ficha de emissão obedece à validação", () => {
  const tipi = { geral: { codigo: "84379000", aliquotaTipo: "PERCENTUAL", aliquotaValor: 3.25 }, excecoes: [] };
  const entrada = { ncm: "84379000", cfop: "5101/6101", ufOrigem: "SP", ufDestino: "RS", valor: 100000 };
  const simulacao = (validacao) => simular(entrada, tipi, { validacao });

  it("sem verificação pedida, a ficha sai como sempre", () => {
    const r = simulacao(undefined);
    expect(r.ficha).toBeTruthy();
    expect(r.validacao).toBeNull();
  });

  it("com todas as regras pendentes, a ficha continua saindo", () => {
    const c = situacaoDoConjunto([situacaoDaRegra(regra(), undefined)]);
    expect(simulacao(c).ficha).toBeTruthy();
  });

  it("com uma regra contestada, a ficha NÃO sai e o motivo sobe como alerta alto", () => {
    const c = situacaoDoConjunto([situacaoDaRegra(regra(), decisao({ estado: SITUACAO.CONTESTADA, ressalva: "o resumo não bate" }))]);
    const r = simulacao(c);
    expect(r.ficha).toBeNull();
    expect(r.alertas.some((a) => a.nivel === "alto" && a.texto.includes("não bate"))).toBe(true);
    // ⚠ O que não depende da regra continua à vista: o IPI vem da TIPI, não do verbete.
    expect(r.ipi.determinado).toBe(true);
  });

  it("registro indisponível também segura a ficha", () => {
    const c = situacaoDoConjunto([situacaoDaRegra(regra(), undefined, { disponivel: false })]);
    expect(simulacao(c).ficha).toBeNull();
  });
});
