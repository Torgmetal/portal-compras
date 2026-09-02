// GET /api/compras/rm/[id]/mapa-cotacao
//
// O MAPA DE COTAÇÃO DA RM, para a planilha. Vitor (02/09/2026): "preciso criar uma forma de
// extrair uma planilha onde de fato me mostra o mapa de cotação da RM, pois hoje estou vendo
// apenas as quantidades informadas na RM (…) o preço por kg do Thiago acaba sendo maior e possa
// ser que eu acabe comprando com ele por algum viés".
//
// ⚠⚠ SÓ LEITURA. Nada aqui escreve: não marca vencedor, não mexe em cotação, item ou pedido. O
// front (BotaoMapaCotacao) monta o Excel a partir deste JSON, igual ao Resumo FD.
//
// ⚠⚠ O QUE ESTE JSON DEVOLVE E A TELA NÃO DAVA — e é o motivo de existir:
//
//   · R$/kg, bruto e LÍQUIDO. Comparar totais esconde cobertura: medido na T118-003, a FERALVAREZ
//     saía R$ 290.681 contra R$ 654.745 da SOUFER e parecia 55% mais barata — atendendo 12 de 30
//     itens, 37,7% do peso. Por quilo líquido a ordem se inverte (7,49 contra 6,41).
//   · O peso que o fornecedor OFERECEU, quando difere do pedido. Hoje `qtdProposta` está vazio em
//     4.128 de 4.128 linhas — o fornecedor não tem onde informar —, então a coluna nasce dizendo
//     "igual". Ela existe para o dia em que o portal do fornecedor perguntar isso a ele.
//   · A observação do ITEM. 26,3% preenchida, e é lá que mora o prazo real ("PRODUÇÃO 10 DIAS
//     ÚTEIS") e a ressalva que decide ("MAT IMPORTADO"). Nunca chegava a quem compra.
//   · O histórico de entrega do fornecedor, que o portal já tem e ninguém usava na hora de decidir.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 60;

const ROLES = ["ADMIN", "COMPRAS", "COMERCIAL", "PCP", "PLANEJAMENTO"];

export async function GET(_req, { params }) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const rm = await prisma.rM.findUnique({
    where: { id: params.id },
    select: {
      id: true, numero: true, createdAt: true,
      op: { select: { numero: true, cliente: true, obra: true } },
      itens: {
        where: { canceladoEm: null },
        select: { id: true, ordem: true, descricao: true, material: true, unidade: true,
                  qtd: true, peso: true, comprimento: true, status: true },
        orderBy: { ordem: "asc" },
      },
      cotacoes: {
        where: { status: "RECEBIDA" },
        select: {
          id: true, fornecedorNome: true, prazoPagamento: true, observacao: true,
          numeroProposta: true, recebidaEm: true,
          itens: {
            select: { rmItemId: true, precoUnit: true, qtdCotada: true, qtdProposta: true,
                      semEstoque: true, icmsPct: true, ipiPct: true, observacao: true,
                      prazoEntrega: true, vencedor: true },
          },
          _count: { select: { anexos: true } },
        },
        orderBy: { fornecedorNome: "asc" },
      },
    },
  });
  if (!rm) return NextResponse.json({ error: "RM não encontrada." }, { status: 404 });
  if (!rm.cotacoes.length) return NextResponse.json({ error: "Nenhuma cotação recebida nesta RM." }, { status: 400 });

  // ⚠ HISTÓRICO DE ENTREGA — uma consulta só para todos os fornecedores da RM, não uma por
  // fornecedor: com 8 cotações seriam 8 idas ao banco para montar um cabeçalho.
  //
  // 🚨 O NÚMERO PRECISA SER LIDO COM RESSALVA e a planilha diz isso. Medido em 02/09/2026: o atraso
  // médio fica em ~30 dias para QUASE TODOS os fornecedores (SOUFER 3 de 46 no prazo, AÇOS MAQ 3 de
  // 34, GERDAU 0 de 9). Quando catorze fornecedores diferentes dão o mesmo número, a hipótese mais
  // provável não é que os catorze sejam ruins — é que `prazoEntregaPrevisto` esteja sendo gravado
  // como a data que NÓS pedimos e nunca renegociado. Serve para conversar, não para vetar.
  const nomes = [...new Set(rm.cotacoes.map((c) => c.fornecedorNome).filter(Boolean))];
  const hist = new Map();
  if (nomes.length) {
    const linhas = await prisma.$queryRaw`
      SELECT "fornecedorNome" nome,
        count(*) FILTER (WHERE "dataEntregaReal" IS NOT NULL)::int entregues,
        count(*) FILTER (WHERE "dataEntregaReal" IS NOT NULL AND "prazoEntregaPrevisto" IS NOT NULL
                           AND "dataEntregaReal" <= "prazoEntregaPrevisto")::int noprazo,
        round(avg(EXTRACT(EPOCH FROM ("dataEntregaReal" - "prazoEntregaPrevisto"))/86400)
              FILTER (WHERE "dataEntregaReal" IS NOT NULL AND "prazoEntregaPrevisto" IS NOT NULL)::numeric, 0) atraso
      FROM "PedidoOmie"
      WHERE "fornecedorNome" = ANY(${nomes})
      GROUP BY 1`;
    for (const l of linhas) hist.set(l.nome, { entregues: l.entregues, noPrazo: l.noprazo, atrasoMedio: l.atraso == null ? null : Number(l.atraso) });
  }

  const fornecedores = rm.cotacoes.map((c) => ({
    cotacaoId: c.id, nome: c.fornecedorNome,
    prazoPagamento: c.prazoPagamento || null,
    observacao: (c.observacao || "").trim() || null,
    numeroProposta: (c.numeroProposta || "").trim() || null,
    anexos: c._count.anexos,
    recebidaEm: c.recebidaEm ? c.recebidaEm.toISOString() : null,
    historico: hist.get(c.fornecedorNome) || null,
  }));

  // ⚠⚠ AS DUAS CONTAS DE IMPOSTO SÃO AS DA TELA, não uma segunda versão. Ver MapaCotacaoClient:
  //   nota    = preço × (1 + IPI)          → o que sai do caixa
  //   líquido = preço × (1 − ICMS) × (1+IPI) → o custo real da Torg, já creditado o ICMS
  // Inventar aqui uma fórmula própria faria a planilha e a tela apontarem vencedores diferentes
  // para a mesma cotação, que é o jeito mais rápido de a equipe parar de confiar nas duas.
  const celula = (rmItem, ci) => {
    if (!ci) return { estado: "não cotou" };
    const obs = (ci.observacao || "").trim() || null;
    const prazo = ci.prazoEntrega ? ci.prazoEntrega.toISOString().slice(0, 10) : null;
    if (ci.semEstoque) return { estado: "sem estoque", observacao: obs, prazoEntrega: prazo };
    const preco = Number(ci.precoUnit) || 0;
    const qtd = Number(ci.qtdCotada) || 0;
    if (!(preco * qtd > 0)) return { estado: "sem preço", observacao: obs, prazoEntrega: prazo };

    const icms = Number(ci.icmsPct) || 0, ipi = Number(ci.ipiPct) || 0;
    const nota = preco * qtd * (1 + ipi / 100);
    const liquido = preco * qtd * (1 - icms / 100) * (1 + ipi / 100);
    const kgPedido = Number(rmItem.peso) || 0;

    // ⚠ o peso que o fornecedor ofereceu: hoje sempre igual ao pedido (`qtdProposta` nunca é
    // preenchido). Fica pronto para quando ele puder responder com o que tem no estoque.
    const kgOfertado = ci.qtdProposta != null && Number(ci.qtdProposta) > 0 && qtd > 0
      ? Math.round(kgPedido * (Number(ci.qtdProposta) / qtd) * 100) / 100
      : kgPedido;

    return {
      estado: "ok", vencedor: !!ci.vencedor,
      precoUnit: preco, qtdCotada: qtd, icmsPct: icms, ipiPct: ipi,
      kgPedido, kgOfertado, diferencaKg: Math.round((kgOfertado - kgPedido) * 100) / 100,
      valorNota: nota, valorLiquido: liquido,
      rkgBruto: kgPedido > 0 ? nota / kgPedido : null,
      rkgLiquido: kgPedido > 0 ? liquido / kgPedido : null,
      // ⚠ CUSTO DO NECESSÁRIO × VALOR DA COMPRA. É a separação que responde à pergunta do Vitor:
      // o primeiro é o que custa o aço QUE A OBRA PRECISA naquele fornecedor (comparável entre
      // todos); o segundo é o que sai do caixa, sobra incluída. Um número só decidiria errado
      // sempre que o fornecedor ofertasse peso diferente.
      custoNecessario: liquido,
      valorCompra: kgPedido > 0 ? (liquido / kgPedido) * kgOfertado : liquido,
      observacao: obs, prazoEntrega: prazo,
    };
  };

  const itens = rm.itens.map((it) => ({
    ordem: it.ordem + 1, descricao: it.descricao, material: it.material || null,
    unidade: it.unidade, qtd: Number(it.qtd) || 0, pesoKg: Number(it.peso) || 0,
    comprimento: it.comprimento || null, status: it.status,
    celulas: rm.cotacoes.map((c) => celula(it, c.itens.find((x) => x.rmItemId === it.id))),
  }));

  return NextResponse.json({
    rm: { numero: rm.numero, criadaEm: rm.createdAt.toISOString(),
          op: rm.op?.numero || null, cliente: rm.op?.cliente || null, obra: rm.op?.obra || null },
    fornecedores, itens,
  });
}
