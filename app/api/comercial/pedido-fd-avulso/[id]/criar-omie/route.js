// POST — dispara a criacao do pedido no Omie a partir de um FD avulso
// cadastrado em modo PENDENTE_OMIE. Apos sucesso, atualiza o registro
// com codigoPedido/numeroPedido devolvidos pelo Omie e status=CRIADO.
//
// Pra simplificar (FD avulso nao tem itens detalhados), cria 1 item
// generico com qtd=1, valorUnit=total, descricao=observacao.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { criarPedidoOmie, anexarAoPedidoOmie } from "@/lib/omie-pedido-compra";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMERCIAL", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao." }, { status: 403 });
  }

  const ped = await prisma.pedidoOmie.findUnique({
    where: { id: params.id },
    include: { op: { select: { numero: true } } },
  });
  if (!ped) return NextResponse.json({ error: "Pedido nao encontrado." }, { status: 404 });
  if (!ped.criadoManualmente) {
    return NextResponse.json(
      { error: "Esse endpoint so funciona pra FDs avulsos cadastrados manualmente." },
      { status: 400 }
    );
  }
  if (ped.status === "CRIADO" && ped.codigoPedido) {
    return NextResponse.json(
      { error: "Esse pedido ja foi criado no Omie (codigo " + ped.codigoPedido + ")." },
      { status: 409 }
    );
  }

  // Monta payload pra criarPedidoOmie
  const descricaoItem = ped.observacao
    || `FD ${ped.fornecedorNome}${ped.categoriaItem ? ` — ${ped.categoriaItem}` : ""}`;

  const resultado = await criarPedidoOmie({
    itens: [
      {
        codigo: null, // usa produto generico
        descricao: descricaoItem.substring(0, 120),
        qtd: 1,
        valorUnit: ped.total,
        ipiPct: 0,
        icmsPct: 0,
      },
    ],
    observacao: `[FD avulso] OP ${ped.op?.numero || ""} — ${ped.fornecedorNome}`
      + (ped.categoriaItem ? ` (${ped.categoriaItem})` : ""),
    nCodFor: ped.nCodFor || null,
    cnpjFornecedor: ped.cnpj || null,
    cNumPedido: `FD-${(ped.op?.numero || "")}-${ped.id.substring(0, 6)}`,
    cInfAdic: ped.observacao || "",
  });

  if (resultado.error) {
    await prisma.pedidoOmie.update({
      where: { id: ped.id },
      data: {
        status: "ERRO",
        erroOmie: resultado.error,
      },
    });
    return NextResponse.json(
      { error: "Falha no Omie: " + resultado.error, detalhes: resultado },
      { status: 502 }
    );
  }

  // Sucesso — atualiza o registro com codigos retornados
  const atualizado = await prisma.pedidoOmie.update({
    where: { id: ped.id },
    data: {
      status: "CRIADO",
      codigoPedido: String(resultado.codigo_pedido || resultado.codigoPedido || ""),
      numeroPedido: String(resultado.numero_pedido || resultado.numeroPedido || ""),
      erroOmie: null,
      payload: resultado.payload || null,
      resposta: resultado.resposta || null,
    },
  });

  // Anexa o PDF no Omie (best-effort — nao quebra o fluxo se falhar)
  if (ped.anexoUrl) {
    try {
      await anexarAoPedidoOmie({
        nCodPed: Number(atualizado.codigoPedido),
        anexos: [{ url: ped.anexoUrl, nomeArquivo: ped.anexoNome || "fd-avulso.pdf" }],
        appKey: process.env.OMIE_APP_KEY,
        appSecret: process.env.OMIE_APP_SECRET,
      });
    } catch (e) {
      console.warn("[fd-avulso anexo Omie]", e?.message);
    }
  }

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "criar_pedido_omie_fd_avulso",
      entity: "PedidoOmie",
      entityId: ped.id,
      diff: {
        fornecedor: ped.fornecedorNome,
        total: ped.total,
        numeroPedidoOmie: atualizado.numeroPedido,
      },
    },
  });

  return NextResponse.json({ pedido: atualizado });
}
