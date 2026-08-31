import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 15;

// GET /api/op/[id]/controle-financeiro
// Retorna resumo financeiro da OP: pedidos Omie + itens atendidos por estoque.
// O custo de estoque e INFORMATIVO — nao subtrai do contrato/FD.
export async function GET(req, { params }) {
  try {
    await requireRole(["ADMIN", "COMPRAS", "COMERCIAL"]);
    const { id } = await params;

    const op = await prisma.oP.findUnique({
      where: { id },
      select: {
        id: true,
        numero: true,
        valorTotalContrato: true,
        rms: {
          select: {
            id: true,
            numero: true,
            itens: {
              where: { status: "ATENDIDO_ESTOQUE" },
              select: {
                id: true,
                descricao: true,
                unidade: true,
                qtd: true,
                peso: true,
                material: true,
                codigo: true,
                atendidoEstoqueQtd: true,
                atendidoEstoquePreco: true,
                atendidoEstoqueTotal: true,
                atendidoEstoqueEm: true,
                atendidoEstoqueObs: true,
                rm: { select: { numero: true } },
              },
            },
          },
        },
        // ⚠ a VERBA por categoria: é o que o Compras pode gastar em cada família (ver a regra de
        // receita × verba). Sem ela, a tela mostra o realizado sem nada para comparar.
        itens: { select: { categoria: true, valorVerba: true } },
        aditivos: { select: { itens: { select: { categoria: true, valorVerba: true } } } },
      },
    });

    if (!op) {
      return NextResponse.json({ error: "OP nao encontrada" }, { status: 404 });
    }

    // Busca TODOS os pedidos vinculados a esta OP:
    // - via opId direto (FD avulsos)
    // - via cotacao de uma RM desta OP
    const rmIds = op.rms.map((r) => r.id);
    const allPedidos = await prisma.pedidoOmie.findMany({
      where: {
        OR: [
          { opId: id },
          ...(rmIds.length > 0 ? [{ cotacao: { rmId: { in: rmIds } } }] : []),
        ],
        status: { not: "REVERTIDO" },
      },
      select: {
        id: true,
        fornecedorNome: true,
        numeroPedido: true,
        total: true,
        status: true,
        statusEntrega: true,
        nfNumero: true,
        createdAt: true,
        faturamentoDireto: true,
        // por onde o pedido acha a categoria da verba que consumiu ↓
        categoriaItem: true,
        cotacao: { select: { rm: { select: { categoriasOP: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Itens atendidos por estoque (flatten de todas as RMs)
    const itensEstoque = op.rms.flatMap((rm) =>
      rm.itens.map((it) => ({
        id: it.id,
        rmNumero: it.rm.numero,
        descricao: it.descricao,
        material: it.material,
        codigo: it.codigo,
        unidade: it.peso > 0 ? "KG" : it.unidade,
        quantidade: it.atendidoEstoqueQtd || (it.peso > 0 ? it.peso : it.qtd),
        precoUnit: it.atendidoEstoquePreco || 0,
        total: it.atendidoEstoqueTotal || 0,
        data: it.atendidoEstoqueEm,
        obs: it.atendidoEstoqueObs,
      }))
    );

    // Totais
    const totalEstoque = itensEstoque.reduce((s, i) => s + (i.total || 0), 0);
    const pedidosTorg = allPedidos.filter((p) => !p.faturamentoDireto);
    const pedidosFD = allPedidos.filter((p) => p.faturamentoDireto);
    const totalPedidosTorg = pedidosTorg.reduce((s, p) => s + (p.total || 0), 0);
    const totalPedidosFD = pedidosFD.reduce((s, p) => s + (p.total || 0), 0);
    const totalPedidos = totalPedidosTorg + totalPedidosFD;

    return NextResponse.json({
      success: true,
      data: {
        valorContrato: op.valorTotalContrato || 0,
        pedidos: {
          torg: { lista: pedidosTorg, total: totalPedidosTorg },
          fd: { lista: pedidosFD, total: totalPedidosFD },
          total: totalPedidos,
        },
        estoque: {
          itens: itensEstoque,
          total: totalEstoque,
        },
        custoTotal: totalPedidos + totalEstoque,
        verba: montarVerba(op, allPedidos, totalPedidos),
      },
    });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: e.message }, { status });
  }
}

// ─── VERBA PREVISTA × REALIZADA ───────────────────────────────────────────────
// Vitor (30/08/2026): "aqui era bom ser mais detalhado e mostrar as verbas previstas × as
// realizadas".
//
// PREVISTO = `OPItem.valorVerba` (contrato + aditivos). É o que o Compras pode gastar em cada
// família — não é receita; a receita está na aba do contrato.
// REALIZADO = pedidos emitidos.
//
// ⚠ O ESTOQUE FICA DE FORA DO REALIZADO. O cabeçalho da tela já diz que o custo de estoque é
// ESTIMADO (CMC do Omie) e não sai do contrato; somá-lo faria a comparação com a verba mentir
// para mais. Ele continua aparecendo no custo total, que é outra pergunta.
//
// ⚠⚠ DE ONDE SAI A CATEGORIA DE UM PEDIDO. `PedidoOmie.categoriaItem` está preenchido em 14 de
// 228 pedidos (6%) — não dá para usar sozinho. O caminho que existe de verdade é
// pedido → cotação → RM → `categoriasOP`. Medido em 30/08/2026 sobre os 228 pedidos vivos:
//   · 187 com exatamente 1 categoria  R$ 4.939.165,08  → entram na família certa
//   ·   1 com 2+ categorias           R$     5.341,18  → não dá para ratear, vai para "Vários"
//   ·  25 sem categoria na RM         R$    29.158,43  → "Sem categoria"
//   ·  15 sem RM (FD avulso)          R$ 1.228.879,26  → usa `categoriaItem`, senão "Sem categoria"
// Os três últimos grupos aparecem NOMEADOS na tela em vez de sumirem: quem lê precisa saber que
// aquele dinheiro saiu, mesmo sem família definida. A soma das linhas fecha com o realizado.
const SEM_CATEGORIA = "Sem categoria";
const VARIAS = "Várias categorias";

function categoriaDoPedido(pedido) {
  const cats = pedido.cotacao?.rm?.categoriasOP;
  if (cats?.length === 1) return cats[0];
  if (cats?.length > 1) return VARIAS;
  return pedido.categoriaItem || SEM_CATEGORIA;
}

function montarVerba(op, pedidos, totalPedidos) {
  const linhas = new Map();
  const linha = (cat) => {
    if (!linhas.has(cat)) linhas.set(cat, { categoria: cat, previsto: 0, realizado: 0, pedidos: 0 });
    return linhas.get(cat);
  };

  for (const i of op.itens || []) linha(i.categoria || SEM_CATEGORIA).previsto += i.valorVerba || 0;
  for (const a of op.aditivos || [])
    for (const i of a.itens || []) linha(i.categoria || SEM_CATEGORIA).previsto += i.valorVerba || 0;

  for (const pe of pedidos) {
    const l = linha(categoriaDoPedido(pe));
    l.realizado += pe.total || 0;
    l.pedidos += 1;
  }

  const prevista = [...linhas.values()].reduce((s, l) => s + l.previsto, 0);
  return {
    prevista,
    realizado: totalPedidos,
    saldo: prevista - totalPedidos,
    pct: prevista > 0 ? (totalPedidos / prevista) * 100 : 0,
    // ordem: quem tem mais verba primeiro; as linhas sem previsto (gasto fora do orçado) no fim,
    // que é justamente onde elas incomodam e precisam ser vistas
    linhas: [...linhas.values()].sort((a, b) => b.previsto - a.previsto || b.realizado - a.realizado),
  };
}
