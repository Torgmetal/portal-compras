// POST /api/rm/[id]/gerar-pedido-direto
// Gera o pedido de compra no Omie DIRETO de uma RM de MONTAGEM (medição com
// valor informado pelo solicitante) ou de ALUGUEL (diária × dias) — sem
// cotação. O pedido nasce vinculado à OP (PedidoOmie.opId) para o custo
// aparecer no extrato/controle da obra.
//
// Body: { fornecedorNome, cnpj?, nCodOmie?, categoria, localEstoque?,
//         codigoServicoOmie?, prazoPagamento?, observacao? }
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { criarPedidoOmie } from "@/lib/omie-pedido-compra";
import { resolverCodProjetoPorOp } from "@/lib/omie-pedidos-abertos";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  fornecedorNome: z.string().min(2, "Informe o fornecedor"),
  cnpj: z.string().optional().nullable(),
  nCodOmie: z.string().optional().nullable(),
  categoria: z.string().min(1, "Categoria de Compra é obrigatória"),
  localEstoque: z.string().optional().nullable(),
  // Código do serviço no Omie (produto tipo serviço) — sem ele a lib tenta
  // casar pela descrição e pode falhar.
  codigoServicoOmie: z.string().optional().nullable(),
  prazoPagamento: z.string().optional().nullable(),
  observacao: z.string().max(1000).optional().nullable(),
});

// Valor unitário do item: montagem usa valorTotal; aluguel tem fallback
// diária × dias para registros antigos sem valorTotal preenchido.
function valorUnitItem(it) {
  if (Number(it.valorTotal) > 0) return Number(it.valorTotal);
  if (Number(it.valorDiaria) > 0 && Number(it.qtdDias) > 0) {
    return Number(it.valorDiaria) * Number(it.qtdDias);
  }
  return 0;
}

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMPRAS"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const cnpjLimpo = String(body.cnpj || "").replace(/\D/g, "");
  const nCodFor = Number(body.nCodOmie) || 0;
  if (!nCodFor && cnpjLimpo.length < 11) {
    return NextResponse.json({ error: "Informe o CNPJ do fornecedor (ou um fornecedor do cadastro com código Omie)." }, { status: 400 });
  }

  const rm = await prisma.rM.findUnique({
    where: { id: params.id },
    include: {
      op: { select: { id: true, numero: true } },
      itens: { where: { canceladoEm: null }, orderBy: { ordem: "asc" } },
    },
  });
  if (!rm) return NextResponse.json({ error: "RM não encontrada" }, { status: 404 });
  if (!["MONTAGEM", "ALUGUEL"].includes(rm.tipoRM)) {
    return NextResponse.json({ error: "Esta rota é só para RM de Montagem ou Aluguel (valor informado pelo solicitante, sem cotação)." }, { status: 400 });
  }
  const ehAluguel = rm.tipoRM === "ALUGUEL";
  const rotulo = ehAluguel ? "Aluguel de equipamentos" : "Medição de montagem";
  if (!rm.op) return NextResponse.json({ error: `RM de ${ehAluguel ? "Aluguel" : "Montagem"} sem OP vinculada.` }, { status: 400 });

  const itensPendentes = rm.itens.filter((it) => !["PEDIDO_GERADO", "CANCELADO", "ATENDIDO_ESTOQUE"].includes(it.status));
  if (itensPendentes.length === 0) {
    return NextResponse.json({ error: "Todos os itens desta RM já viraram pedido (ou foram cancelados)." }, { status: 409 });
  }
  const semValor = itensPendentes.find((it) => !(valorUnitItem(it) > 0));
  if (semValor) {
    return NextResponse.json({ error: `Item "${semValor.descricao}" sem valor — edite a RM antes de gerar.` }, { status: 400 });
  }

  // Itens do pedido: 1 linha por item, preço = valor informado (montagem:
  // medição com qtd 1; aluguel: diária × dias por unidade, × qtd de unidades).
  const itensOmie = itensPendentes.map((it) => ({
    codigo: (body.codigoServicoOmie || "").trim() || it.codigoOmieEstoque || null,
    descricao: it.descricao,
    unidade: it.unidade || "UN",
    qtd: Number(it.qtd) || 1,
    precoUnit: Math.round(valorUnitItem(it) * 100) / 100,
  }));
  const total = itensOmie.reduce((s, it) => s + it.precoUnit * it.qtd, 0);

  // Projeto da OP no Omie (best-effort — não bloqueia)
  let nCodProj = null;
  try { nCodProj = await resolverCodProjetoPorOp(rm.op.numero); } catch { /* segue sem projeto */ }

  const resultado = await criarPedidoOmie({
    itens: itensOmie,
    observacao: `${rotulo} — RM ${rm.numero} — OP ${rm.op.numero}`,
    nCodFor,
    cnpjFornecedor: cnpjLimpo || null,
    cNumPedido: `${ehAluguel ? "AL" : "MT"}-${rm.numero}`,
    cCodCateg: body.categoria,
    cCodLocalEstoque: body.localEstoque || null,
    nCodProj,
    nQtdeParc: 1,
    prazoPagamento: body.prazoPagamento || null,
    cInfAdic: [`OP ${rm.op.numero}`, body.observacao].filter(Boolean).join(" — "),
  });

  if (resultado.error) {
    await prisma.auditLog.create({
      data: {
        userId: user.id, action: ehAluguel ? "gerar_pedido_aluguel_erro" : "gerar_pedido_montagem_erro", entity: "RM", entityId: rm.id,
        diff: { rmNumero: rm.numero, erro: String(resultado.error).slice(0, 400) },
      },
    }).catch(() => {});
    return NextResponse.json({ error: "Omie recusou o pedido: " + resultado.error }, { status: 502 });
  }

  // Persistência atômica: pedido local (vinculado à OP → extrato da obra) +
  // itens PEDIDO_GERADO (evita pedido duplicado na próxima geração).
  let pedido;
  await prisma.$transaction(async (tx) => {
    pedido = await tx.pedidoOmie.create({
      data: {
        opId: rm.op.id,
        cotacaoId: null,
        rmAtendidaId: rm.id,
        fornecedorNome: body.fornecedorNome.trim().toUpperCase(),
        nCodFor: resultado.nCodFor_resolvido ? String(resultado.nCodFor_resolvido) : (nCodFor ? String(nCodFor) : null),
        cnpj: cnpjLimpo || null,
        codigoPedido: resultado.codigo_pedido ? String(resultado.codigo_pedido) : null,
        numeroPedido: resultado.numero_pedido ? String(resultado.numero_pedido) : null,
        total: Math.round(total * 100) / 100,
        faturamentoDireto: rm.faturamentoDireto || false,
        status: "CRIADO",
        criadoManualmente: true,
        categoriaItem: rm.tipoRM,
        observacao: body.observacao || `${rotulo} — RM ${rm.numero}`,
        itensDetalhes: itensOmie.map((it) => ({ descricao: it.descricao, qtd: it.qtd, unidade: it.unidade, valorUnit: it.precoUnit })),
        payload: itensOmie,
        createdById: user.id,
      },
    });

    await tx.rMItem.updateMany({
      where: { id: { in: itensPendentes.map((i) => i.id) } },
      data: { status: "PEDIDO_GERADO", pedidoOmieId: pedido.id },
    });

    // RM concluída quando todos os itens estão finalizados
    const restantes = await tx.rMItem.findMany({ where: { rmId: rm.id }, select: { status: true } });
    if (restantes.every((i) => ["PEDIDO_GERADO", "CANCELADO", "ATENDIDO_ESTOQUE"].includes(i.status))) {
      await tx.rM.update({ where: { id: rm.id }, data: { status: "PEDIDO_GERADO" } });
    }

    await tx.auditLog.create({
      data: {
        userId: user.id, action: ehAluguel ? "gerar_pedido_aluguel" : "gerar_pedido_montagem", entity: "PedidoOmie", entityId: pedido.id,
        diff: {
          rmNumero: rm.numero, opNumero: rm.op.numero, fornecedor: body.fornecedorNome,
          total, itens: itensOmie.length, numeroPedido: resultado.numero_pedido || null,
        },
      },
    });
  });

  return NextResponse.json({
    success: true,
    pedido: { id: pedido.id, numeroPedido: pedido.numeroPedido, codigoPedido: pedido.codigoPedido, total: pedido.total },
  });
}
