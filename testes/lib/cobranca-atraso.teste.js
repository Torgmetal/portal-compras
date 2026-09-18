// Quem entra na cobrança, e como os pedidos se agrupam por fornecedor.
//
// ⚠⚠ O TESTE QUE MAIS IMPORTA AQUI É O DE VAZAMENTO: o e-mail de um fornecedor não pode conter
// pedido de outro. Ele afirma o resultado ESPERADO explicitamente, sem recalcular com
// `chaveFornecedor` — um teste que usa a mesma função que está testando passa mesmo se ela mudar
// de ideia sobre quem é quem (achado do Codex, 17/09/2026).
import { describe, it, expect } from "vitest";
import { agruparParaCobranca, diasDeAtraso, podeCobrar, BLOQUEIOS, emailDoPedido } from "@/lib/cobranca-atraso";

const HOJE = new Date("2026-09-18T12:00:00-03:00").getTime();
const dia = (d) => new Date(`2026-09-${String(d).padStart(2, "0")}T12:00:00-03:00`);

/**
 * Um pedido como a rota o entrega: fornecedor, prazo e a RM pelo primeiro item.
 *
 * ⚠ Usa `"campo" in o` e não `??`: `??` só cai no padrão em `null`/`undefined`, então escrever
 * `ped({ prazo: null })` devolvia o prazo PADRÃO — e o teste passava por acidente.
 */
const ped = (o = {}) => {
  const ou = (k, padrao) => (k in o ? o[k] : padrao);
  return {
    id: ou("id", "p1"),
    numeroPedido: ou("numeroPedido", 1000),
    fornecedorNome: ou("fornecedorNome", "SOUFER"),
    cnpj: ou("cnpj", "45987062000177"),
    statusEntrega: ou("statusEntrega", null),
    dataEntregaReal: ou("dataEntregaReal", null),
    recebidoEm: ou("recebidoEm", null),
    encerradoOmieEm: ou("encerradoOmieEm", null),
    prazoEntregaPrevisto: ou("prazo", dia(10)),
    prazoOriginal: ou("prazoOriginal", null),
    faturamentoDireto: false,
    acompanhamentos: ou("acompanhamentos", []),
    cotacao: {
      observacao: null,
      fornecedorEmail: ou("email", "centroaco5@terra.com.br"),
      fornecedor: { email: ou("cadastro", null) },
      itens: [],
    },
    rmItens: [{ rm: { numero: ou("rm", "T118-001-R00"),
      op: { numero: ou("op", "118"), cliente: ou("cliente", "DANPOWER") } } }],
  };
};

describe("quem entra na cobrança", () => {
  it("prazo vencido há 1 dia entra; vencendo hoje, não", () => {
    expect(podeCobrar(ped({ prazo: dia(17) }), HOJE)).toBe(true);
    expect(podeCobrar(ped({ prazo: dia(18) }), HOJE)).toBe(false);
    expect(podeCobrar(ped({ prazo: dia(20) }), HOJE)).toBe(false);
  });

  it("conta os dias de atraso como a tela conta", () => {
    expect(diasDeAtraso(ped({ prazo: dia(10) }), HOJE)).toBe(8);
    expect(diasDeAtraso(ped({ prazo: dia(20) }), HOJE)).toBe(0);
  });

  // ⚠⚠ Na tela o recebido parcial tem chip próprio e SAI de "Atrasado". Para cobrar é o contrário:
  // o que falta dele é exatamente o que precisa ser cobrado.
  it("⚠⚠ o recebido parcial vencido ENTRA, ao contrário do chip 'Atrasado' da tela", () => {
    const p = ped({ statusEntrega: "PARCIAL", prazo: dia(10) });
    expect(podeCobrar(p, HOJE)).toBe(true);
    expect(agruparParaCobranca([p], HOJE)[0].pedidos[0].parcial).toBe(true);
  });

  // ⚠ Pedido encerrado no Omie conta como chegado — cobrar quem já entregou queima a relação.
  it("⚠ quem já chegou ou foi encerrado no Omie não é cobrado", () => {
    expect(podeCobrar(ped({ prazo: dia(1), statusEntrega: "ENTREGUE", dataEntregaReal: dia(5) }), HOJE)).toBe(false);
    expect(podeCobrar(ped({ prazo: dia(1), encerradoOmieEm: dia(5) }), HOJE)).toBe(false);
  });

  // ⚠⚠ `dataEntregaReal` SOZINHA NÃO É CHEGADA, e medir isso mudou o teste, não o código. Ela é
  // anotação humana e existe em 222 dos pedidos vivos; o que carimba chegada é o `statusEntrega`
  // junto dela. Medido em 18/09/2026: os únicos pedidos vencidos com essa data e sem status
  // terminal são 2, ambos PARCIAL da SOUFER — ali a data é da entrega PARCIAL, e o que falta está
  // 38 e 41 dias atrasado. Cobrar é o certo.
  it("⚠⚠ parcial com data de entrega anotada CONTINUA sendo cobrado — falta o resto", () => {
    const p = ped({ prazo: dia(1), statusEntrega: "PARCIAL", dataEntregaReal: dia(5) });
    expect(podeCobrar(p, HOJE)).toBe(true);
  });

  it("pedido sem prazo nenhum não é cobrado — não há data a cobrar", () => {
    expect(podeCobrar(ped({ prazo: null }), HOJE)).toBe(false);
  });
});

describe("⚠⚠ o e-mail de um fornecedor não leva pedido de outro", () => {
  const A = ped({ id: "a1", cnpj: "11111111000101", fornecedorNome: "ALFA", email: "alfa@x.com",
    numeroPedido: 9001, rm: "RM-ALFA", prazo: dia(5) });
  const B = ped({ id: "b1", cnpj: "22222222000102", fornecedorNome: "BETA", email: "beta@y.com",
    numeroPedido: 9002, rm: "RM-BETA", prazo: dia(6) });

  it("cada grupo tem exatamente os seus pedidos", () => {
    const g = agruparParaCobranca([A, B], HOJE);
    const alfa = g.find((x) => x.nome === "ALFA");
    const beta = g.find((x) => x.nome === "BETA");
    // afirmado explicitamente, não recalculado
    expect(alfa.pedidos.map((l) => l.numeroPedido)).toEqual([9001]);
    expect(alfa.pedidos.map((l) => l.rmNumero)).toEqual(["RM-ALFA"]);
    expect(alfa.email).toBe("alfa@x.com");
    expect(beta.pedidos.map((l) => l.numeroPedido)).toEqual([9002]);
    expect(beta.email).toBe("beta@y.com");
  });

  // ⚠⚠ MATRIZ E FILIAL SÃO A MESMA EMPRESA pela raiz do CNPJ. Medido em 17/09/2026: a SOUFER tem
  // pedidos atrasados em dois CNPJs e UM contato só para os dois — juntar é o certo ali.
  it("⚠⚠ matriz e filial do mesmo CNPJ raiz caem no mesmo e-mail", () => {
    const matriz = ped({ id: "m", cnpj: "45987062000177", numeroPedido: 1, prazo: dia(5) });
    const filial = ped({ id: "f", cnpj: "45987062000681", numeroPedido: 2, prazo: dia(6) });
    const g = agruparParaCobranca([matriz, filial], HOJE);
    expect(g).toHaveLength(1);
    expect(g[0].pedidos.map((l) => l.numeroPedido).sort()).toEqual([1, 2]);
    expect(g[0].bloqueio).toBeNull();
  });

  // ⚠⚠ …MAS SÓ ENQUANTO O DESTINO FOR O MESMO. No dia em que a filial tiver outro contato, mandar
  // tudo para o primeiro e-mail da lista contaria a um o que foi comprado do outro.
  it("⚠⚠ mesmo CNPJ raiz com e-mails DIFERENTES é BLOQUEADO, não escolhe um", () => {
    const m = ped({ id: "m", cnpj: "45987062000177", email: "matriz@soufer.com", prazo: dia(5) });
    const f = ped({ id: "f", cnpj: "45987062000681", email: "filial@soufer.com", prazo: dia(6) });
    const [g] = agruparParaCobranca([m, f], HOJE);
    expect(g.bloqueio).toBe(BLOQUEIOS.VARIOS_DESTINOS);
    expect(g.email).toBeNull();
  });

  // ⚠⚠ Sem CNPJ o agrupamento cai no NOME, e dois cadastros chamados "VENDAS" seriam empresas
  // diferentes no mesmo e-mail.
  it("⚠⚠ pedido sem CNPJ é BLOQUEADO — nome não prova que é a mesma empresa", () => {
    const [g] = agruparParaCobranca([ped({ cnpj: null, fornecedorNome: "VENDAS", prazo: dia(5) })], HOJE);
    expect(g.bloqueio).toBe(BLOQUEIOS.SEM_CNPJ);
  });

  it("fornecedor sem e-mail cadastrado é BLOQUEADO, com motivo próprio", () => {
    const [g] = agruparParaCobranca([ped({ email: null, prazo: dia(5) })], HOJE);
    expect(g.bloqueio).toBe(BLOQUEIOS.SEM_EMAIL);
  });

  it("o e-mail do cadastro vence o da cotação", () => {
    expect(emailDoPedido(ped({ email: "cotacao@x.com", cadastro: "cadastro@x.com" }))).toBe("cadastro@x.com");
    expect(emailDoPedido(ped({ email: "cotacao@x.com", cadastro: null }))).toBe("cotacao@x.com");
  });

  // ⚠⚠ ACHADO DO CODEX (18/09/2026): o pedido sem e-mail não entrava no conjunto de destinos,
  // então o grupo ficava com UM destino e o pedido órfão — com o token público dele — saía no
  // e-mail do contato do outro.
  it("⚠⚠ um pedido SEM e-mail no grupo bloqueia tudo, não pega carona no destino do vizinho", () => {
    const com = ped({ id: "a", cnpj: "45987062000177", email: "matriz@soufer.com", prazo: dia(5) });
    const sem = ped({ id: "b", cnpj: "45987062000681", email: null, prazo: dia(6) });
    const [g] = agruparParaCobranca([com, sem], HOJE);
    expect(g.bloqueio).toBe(BLOQUEIOS.EMAIL_PARCIAL);
    expect(g.email).toBeNull();
  });

  // ⚠⚠ `chaveFornecedor` também produz `doc:<dígitos>` para documento curto ou fictício. Agrupar é
  // afirmar "é a mesma empresa", e só a raiz do CNPJ prova isso.
  it("⚠⚠ documento fictício ou curto é BLOQUEADO — não é CNPJ", () => {
    for (const cnpj of ["0", "123", "00000000000000", "11111111111111"]) {
      const [g] = agruparParaCobranca([ped({ cnpj, prazo: dia(5) })], HOJE);
      expect(g.bloqueio, `cnpj ${cnpj}`).toBe(BLOQUEIOS.SEM_CNPJ);
    }
  });

  it("CNPJ de verdade continua passando", () => {
    expect(agruparParaCobranca([ped({ cnpj: "45987062000177", prazo: dia(5) })], HOJE)[0].bloqueio).toBeNull();
  });

  it("o mesmo endereço em caixa diferente não conta como dois destinos", () => {
    const a = ped({ id: "a", cnpj: "45987062000177", email: "Centro@Terra.com.br", prazo: dia(5) });
    const b = ped({ id: "b", cnpj: "45987062000681", email: "centro@terra.com.br", prazo: dia(6) });
    expect(agruparParaCobranca([a, b], HOJE)[0].bloqueio).toBeNull();
  });
});

describe("a ordem e o conteúdo das linhas", () => {
  it("o pior atraso vem primeiro, no fornecedor e entre fornecedores", () => {
    const g = agruparParaCobranca([
      ped({ id: "1", cnpj: "11111111000101", fornecedorNome: "ALFA", prazo: dia(16) }),
      ped({ id: "2", cnpj: "22222222000102", fornecedorNome: "BETA", prazo: dia(2), numeroPedido: 7 }),
      ped({ id: "3", cnpj: "22222222000102", fornecedorNome: "BETA", prazo: dia(15), numeroPedido: 8 }),
    ], HOJE);
    expect(g.map((x) => x.nome)).toEqual(["BETA", "ALFA"]);
    expect(g[0].pedidos.map((l) => l.numeroPedido)).toEqual([7, 8]);
  });

  it("a linha carrega pedido, RM e obra — é o que Matheus pediu no e-mail", () => {
    const [g] = agruparParaCobranca([ped({ numeroPedido: 1977, rm: "T118-001-R00", op: "118", cliente: "DANPOWER", prazo: dia(8) })], HOJE);
    expect(g.pedidos[0]).toMatchObject({
      numeroPedido: 1977, rmNumero: "T118-001-R00", opNumero: "118", opCliente: "DANPOWER", diasAtraso: 10,
    });
  });

  // ⚠ Repetir a mesma data duas vezes faria o fornecedor procurar a diferença que não existe.
  it("⚠ o prazo original só aparece quando foi renegociado", () => {
    const igual = agruparParaCobranca([ped({ prazo: dia(8), prazoOriginal: dia(8) })], HOJE);
    expect(igual[0].pedidos[0].prazoOriginal).toBeNull();
    const mudou = agruparParaCobranca([ped({ prazo: dia(8), prazoOriginal: dia(1) })], HOJE);
    expect(mudou[0].pedidos[0].prazoOriginal).toEqual(dia(1));
  });
});
