// O texto da cobrança — aprovado por Matheus em 17/09/2026.
//
// ⚠⚠ ESTES TESTES TRAVAM O CONTEÚDO QUE FOI APROVADO, não o desenho. O que não pode sumir numa
// refatoração: o número do pedido, o número da RM, a data combinada e as DUAS perguntas (entrega e
// carregamento). Sem isso o e-mail vira "como está o pedido?", que não dá para responder.
import { describe, it, expect } from "vitest";
import { gerarEmailCobranca } from "@/lib/cobranca-atraso-email";

// ⚠ `"campo" in o` e não `??`: `??` só cai no padrão em `null`, então `linha({ rmNumero: null })`
// devolvia a RM PADRÃO e o teste do travessão passava sem testar nada.
const linha = (o = {}) => {
  const ou = (k, padrao) => (k in o ? o[k] : padrao);
  return {
    id: ou("id", "p1"),
    numeroPedido: ou("numeroPedido", 1977),
    rmNumero: ou("rmNumero", "T118-001-R00"),
    opNumero: ou("opNumero", "118"),
    opCliente: ou("opCliente", "DANPOWER"),
    previsao: ou("previsao", new Date("2026-09-08T12:00:00-03:00")),
    prazoOriginal: ou("prazoOriginal", null),
    diasAtraso: ou("diasAtraso", 10),
    parcial: ou("parcial", false),
    faturamentoDireto: false,
  };
};

const grupo = (pedidos, nome = "SOUFER") => ({ chave: "cnpj:45987062", nome, email: "x@y.com", pedidos });
const links = (p) => Object.fromEntries(p.map((l) => [l.id, `https://portal/fornecedores/entrega/tok-${l.id}`]));

describe("o e-mail de cobrança", () => {
  const p = [linha()];
  const { assunto, html, texto } = gerarEmailCobranca(grupo(p), links(p));

  it("o assunto diz o que é e quantos são", () => {
    expect(assunto).toBe("Torg Metal · Previsão de entrega — 1 pedido em aberto");
  });

  it("o assunto acompanha o plural", () => {
    expect(gerarEmailCobranca(grupo([linha({ id: "a" }), linha({ id: "b" })]), {}).assunto)
      .toMatch(/2 pedidos em aberto/);
  });

  // ⚠⚠ AS DUAS PERGUNTAS. Matheus pediu prazo de entrega E previsão de carregamento: "entrego dia
  // 25" e "está pronto dia 22" levam a programações diferentes no pátio.
  it("⚠⚠ pergunta a data de entrega E quando estará pronto para carregamento", () => {
    for (const corpo of [html, texto]) {
      expect(corpo).toMatch(/nova data de entrega/i);
      expect(corpo).toMatch(/pronto para carregamento/i);
    }
  });

  // ⚠⚠ Pedido, RM e a data combinada: é o que Matheus pediu explicitamente no e-mail.
  it("⚠⚠ leva o número do pedido, o da RM e o prazo combinado", () => {
    for (const corpo of [html, texto]) {
      expect(corpo).toContain("1977");
      expect(corpo).toContain("T118-001-R00");
      expect(corpo).toContain("08/09/2026");
      expect(corpo).toMatch(/10 dias/);
    }
  });

  it("a obra sai como o fornecedor a reconhece: OP e cliente", () => {
    expect(texto).toMatch(/OP 118 · DANPOWER/);
  });

  // ⚠ É a saída mais barata para a lista encolher sozinha.
  it("⚠ pede o número da nota fiscal de volta", () => {
    expect(texto).toMatch(/nota fiscal/i);
  });

  // ⚠ Fecha a porta com quem a Torg vai precisar na semana que vem.
  it("⚠ não acusa: nada de 'urgente' nem de cobrança agressiva", () => {
    expect(texto).not.toMatch(/urgente|inaceitável|descumpr/i);
    expect(texto).toMatch(/já passou da data de entrega combinada/i);
  });

  // ⚠⚠ O TEXTO PLANO NÃO É ENFEITE: cliente que bloqueia HTML, filtro de spam e leitor de tela
  // leem daqui.
  it("⚠⚠ o texto plano existe e carrega a mesma informação", () => {
    expect(texto.length).toBeGreaterThan(300);
    expect(texto).not.toMatch(/<[a-z]/i);
  });

  it("o link de previsão de cada pedido entra nos dois formatos", () => {
    expect(html).toContain("https://portal/fornecedores/entrega/tok-p1");
    expect(texto).toContain("https://portal/fornecedores/entrega/tok-p1");
  });

  it("pedido sem link não quebra o e-mail — só sai sem o atalho", () => {
    const r = gerarEmailCobranca(grupo([linha()]), {});
    expect(r.texto).not.toMatch(/informar previsão/);
    expect(r.texto).toContain("1977");
  });
});

describe("o que a tabela precisa distinguir", () => {
  // ⚠⚠ Metade dos pedidos atrasados da SOUFER já teve entrega parcial. Sem esta coluna o e-mail
  // lista o pedido inteiro como pendente e o fornecedor responde "já mandamos" — com razão.
  it("⚠⚠ marca o recebido parcial, para o fornecedor não responder 'já mandamos'", () => {
    const p = [linha({ parcial: true })];
    const { html, texto } = gerarEmailCobranca(grupo(p), {});
    expect(html).toContain("recebido parcial");
    expect(texto).toContain("recebido parcial");
  });

  it("o que não é parcial sai como aguardando", () => {
    expect(gerarEmailCobranca(grupo([linha()]), {}).texto).toContain("aguardando");
  });

  // ⚠ Repetir a mesma data duas vezes faria o fornecedor procurar a diferença que não existe.
  it("⚠ o prazo combinado ANTES só aparece quando houve renegociação", () => {
    const sem = gerarEmailCobranca(grupo([linha()]), {});
    expect(sem.texto).not.toMatch(/combinado antes/);
    const com = gerarEmailCobranca(grupo([linha({ prazoOriginal: new Date("2026-08-01T12:00:00-03:00") })]), {});
    expect(com.texto).toMatch(/combinado antes: 01\/08\/2026/);
  });

  // ⚠ O nome do fornecedor entra no cabeçalho; HTML cru ali quebraria a formatação ou pior.
  it("⚠ escapa o nome do fornecedor no HTML", () => {
    const r = gerarEmailCobranca(grupo([linha()], 'AÇOS <b>"MAQ"</b>'), {});
    expect(r.html).not.toContain("<b>\"MAQ\"</b>");
    expect(r.html).toContain("&lt;b&gt;");
  });

  it("pedido sem número e sem RM imprime travessão em vez de 'undefined'", () => {
    const r = gerarEmailCobranca(grupo([linha({ numeroPedido: null, rmNumero: null })]), {});
    expect(r.texto).not.toMatch(/undefined|null/);
    expect(r.texto).toMatch(/Pedido — · RM —/);
  });
});
