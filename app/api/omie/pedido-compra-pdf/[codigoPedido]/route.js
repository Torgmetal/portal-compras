import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";

// GET — abre o módulo de Compras do Omie. Nome mantido por compatibilidade com links
// já renderizados em abas abertas; quem monta link novo usa `omiePedidoCompraUrl`.
//
// ⚠⚠ NÃO EXISTE PDF DE PEDIDO DE COMPRA NA API DO OMIE, E ISSO FOI VERIFICADO (17/09/2026).
// Esta rota tentava SETE variantes de chamada (`ObterImpressaoPedCompra`, `GerarPedCompraPDF`,
// `ImprimirPedCompra`…) e o Omie respondia `Method "X" not exists` em todas — status 500, sempre.
// A lista real do endpoint `produtos/pedidocompra/` tem seis métodos e nenhum imprime:
// Incluir, Alterar, Consultar, Excluir, Pesquisar e Upsert. O `produtos/pedido/` (venda), que o
// link das medições usava por engano, também não tem.
//
// ⚠ O prejuízo não era o usuário ver a listagem em vez do PDF — era SETE chamadas à API do Omie a
// cada clique, num limite de 3 req/s compartilhado com todos os crons. Um link que nunca cumpriu
// o que prometia consumindo a cota de quem cumpre.
//
// ⚠ Se algum dia o Omie publicar um método de impressão, o lugar de voltar é aqui: conferir antes
// que o `codigoPedido` pertence a um `PedidoOmie` do portal — sem isso, qualquer pessoa logada
// pediria o documento de qualquer pedido do Omie, inclusive dos que o portal nunca criou.
const OMIE_TENANT = process.env.NEXT_PUBLIC_OMIE_TENANT || "torg-5mos4yik";
const OMIE_COMPRAS_URL = `https://app.omie.com.br/gestao/${OMIE_TENANT}/#COM`;

export async function GET() {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.redirect(OMIE_COMPRAS_URL, 302);
}
