// PATCH /api/compras/entregas/prazo — atualiza prazo de entrega de um pedido
// (postergacao informada pelo fornecedor). Registra historico completo.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { LIMPAR_PROPOSTA } from "@/lib/prazo-proposto";

const schema = z.object({
  pedidoId: z.string().min(1, "pedidoId obrigatorio"),
  novoPrazo: z.string().min(1, "novoPrazo obrigatorio"),
  motivo: z.string().max(500).optional(),
});

/** O que muda no pedido ao remarcar por dentro. */
function montarUpdate(pedido, novoPrazo) {
  const dados = { prazoEntregaPrevisto: novoPrazo };
  // Se nunca teve postergacao, salvar o prazo original
  if (!pedido.prazoOriginal && pedido.prazoEntregaPrevisto) {
    dados.prazoOriginal = pedido.prazoEntregaPrevisto;
  }
  // ⚠⚠ REMARCAR POR DENTRO MATA A PROPOSTA PENDENTE. Deixada viva, o botão "aprovar" da tela
  // continuaria ali e um clique depois sobrescreveria esta decisão com a data (mais antiga) que o
  // fornecedor tinha mandado — sem ninguém perceber que estava desfazendo algo.
  if (pedido.prazoPropostoId) Object.assign(dados, LIMPAR_PROPOSTA);
  return dados;
}

export async function PATCH(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMPRAS"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { success: false, error: "Dados invalidos: " + (e.issues?.[0]?.message || e.message) },
      { status: 400 }
    );
  }

  const novoPrazo = new Date(body.novoPrazo);
  if (isNaN(novoPrazo.getTime())) {
    return NextResponse.json(
      { success: false, error: "Data invalida" },
      { status: 400 }
    );
  }

  // ⚠⚠ A LEITURA VAI DENTRO DA TRANSAÇÃO (achado do Codex, 18/09/2026). Esta rota é o SEGUNDO
  // efetivador do prazo — o outro é `/api/compras/prazos-rm/prazo-proposto`, que aprova a data
  // proposta pelo fornecedor. Lendo antes e gravando depois, os dois podiam ler o mesmo
  // `prazoOriginal` nulo e gravar `prazoAnterior` diferentes no histórico, para o mesmo pedido, no
  // mesmo instante.
  const r = await prisma.$transaction(async (tx) => {
    const pedido = await tx.pedidoOmie.findUnique({
      where: { id: body.pedidoId },
      select: {
        id: true,
        prazoEntregaPrevisto: true,
        prazoOriginal: true,
        numeroPedido: true,
        codigoPedido: true,
        prazoProposto: true,
        prazoPropostoId: true,
      },
    });
    if (!pedido) return { faltou: true };

    const prazoAnterior = pedido.prazoEntregaPrevisto;
    const tinhaProposta = !!pedido.prazoPropostoId;
    await tx.pedidoOmie.update({ where: { id: pedido.id }, data: montarUpdate(pedido, novoPrazo) });

    await tx.prazoHistorico.create({
      data: {
        pedidoId: pedido.id,
        prazoAnterior,
        prazoNovo: novoPrazo,
        motivo: body.motivo?.trim() || null,
        alteradoPorId: user.id,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "ATUALIZAR_PRAZO_ENTREGA",
        entity: "PedidoOmie",
        entityId: pedido.id,
        diff: {
          prazoAnterior: prazoAnterior?.toISOString() || null,
          prazoNovo: novoPrazo.toISOString(),
          motivo: body.motivo?.trim() || null,
          // ⚠ Fica registrado que esta remarcação descartou uma proposta do fornecedor — senão a
          // proposta simplesmente some do banco e ninguém consegue explicar depois.
          propostaDescartada: tinhaProposta
            ? { prazo: pedido.prazoProposto?.toISOString() || null, propostaId: pedido.prazoPropostoId }
            : null,
        },
      },
    });

    return { faltou: false, prazoAnterior, propostaDescartada: tinhaProposta };
  });

  if (r.faltou) {
    return NextResponse.json(
      { success: false, error: "Pedido nao encontrado" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    prazoAnterior: r.prazoAnterior,
    prazoNovo: novoPrazo,
    propostaDescartada: r.propostaDescartada,
  });
}
