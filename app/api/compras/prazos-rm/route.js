// GET — todos os pedidos de compra agrupados por RM, com prazo e etapas de acompanhamento.
// Alimenta a tela Compras › Prazos das RMs (Matheus, 16/09/2026).
//
// ⚠ Só pedido CRIADO: REVERTIDO voltou para cotação e ERRO nunca chegou ao Omie — nenhum dos dois
// tem prazo a acompanhar, e na lista só empurrariam para baixo o que importa.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { agruparPorRM, resumoPorSituacao } from "@/lib/painel-prazos-rm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireRole(["ADMIN", "COMPRAS"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ error: e.message }, { status });
  }

  const pedidos = await prisma.pedidoOmie.findMany({
    where: { status: "CRIADO" },
    select: {
      id: true, numeroPedido: true, fornecedorNome: true, total: true, createdAt: true,
      prazoEntregaPrevisto: true, prazoOriginal: true, statusEntrega: true,
      dataEntregaReal: true, recebidoEm: true, recebidoPor: { select: { name: true } },
      prazoHistorico: {
        select: { id: true, prazoAnterior: true, prazoNovo: true, motivo: true, criadoEm: true, alteradoPor: { select: { name: true } } },
        orderBy: { criadoEm: "asc" },
      },
      acompanhamentos: {
        select: { id: true, etapa: true, data: true, observacao: true, registradoPor: { select: { name: true } } },
        orderBy: { data: "asc" },
      },
      op: { select: { id: true, numero: true, cliente: true, obra: true } },
      // ⚠⚠ O PRAZO QUE O FORNECEDOR INFORMOU NOS ITENS é a última fonte de previsão
      // (`previsaoAtual`). Sem ele, pedido com data gravada nos itens e `prazoEntregaPrevisto`
      // nulo caía em "Sem prazo" aqui e aparecia COM data na tela de Entregas, que já tinha esse
      // fallback. Só os vencedores, que são os que viraram pedido.
      // ⚠ `observacao` vem junto porque é dela que sai o prazo em PALAVRAS ("18 dias úteis"),
      // a última fonte de previsão para os pedidos antigos que nasceram antes de o portal gravar
      // `prazoEntregaPrevisto` na criação.
      cotacao: {
        select: {
          observacao: true,
          itens: { where: { vencedor: true }, select: { prazoEntrega: true, vencedor: true } },
        },
      },
      // ⚠ A RM vem pelos ITENS, não por `rmAtendidaId` (que é de outra coisa e está NULO nos 295
      // pedidos do acervo). É o mesmo caminho que a tela da RM usa para achar seus pedidos.
      rmItens: {
        select: { rm: { select: { id: true, numero: true, tipoRM: true, op: { select: { id: true, numero: true, cliente: true, obra: true } } } } },
        take: 1,
      },
    },
  });

  // ⚠ Um pedido pode atender itens de mais de uma RM (cotação multi-RM). A tela é POR RM, e
  // repetir o pedido em cada uma inflaria os totais; `take: 1` o ancora na primeira, que é a RM
  // de onde ele nasceu. A tela Entregas continua sendo o lugar de ver o pedido por inteiro.
  const comRM = pedidos.map(({ rmItens, ...p }) => ({ ...p, rm: rmItens[0]?.rm || null }));
  const linhas = agruparPorRM(comRM);

  return NextResponse.json({ linhas, resumo: resumoPorSituacao(linhas) });
}
