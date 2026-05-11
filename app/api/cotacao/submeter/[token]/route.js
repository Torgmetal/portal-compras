import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resolverFornecedorPorCnpj } from "@/lib/omie-pedido-compra";

const itemSchema = z.object({
  cotacaoItemId: z.string().min(1),
  precoUnit: z.number().min(0),
  qtdCotada: z.number().min(0),
  icmsPct: z.number().min(0).optional().nullable(),
  ipiPct: z.number().min(0).optional().nullable(),
  observacao: z.string().optional().nullable(),
});

const schema = z.object({
  itens: z.array(itemSchema).min(1),
  cnpj: z.string().optional().nullable(),
  razaoSocial: z.string().optional().nullable(),
  prazoEntrega: z.string().optional().nullable(),
  condicaoPagamento: z.string().optional().nullable(),
  observacao: z.string().optional().nullable(),
});

export async function POST(req, { params }) {
  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados inválidos: " + e.message }, { status: 400 });
  }

  const cotacao = await prisma.cotacao.findUnique({
    where: { token: params.token },
    include: { itens: { select: { id: true } } },
  });
  if (!cotacao) return NextResponse.json({ error: "Token inválido." }, { status: 404 });
  if (cotacao.status === "CANCELADA") {
    return NextResponse.json({ error: "Cotação cancelada." }, { status: 409 });
  }

  const eRevisao = cotacao.status === "RECEBIDA";

  // Arredonda valores numericos pra 2 casas decimais — evita "lixo" do parser IA
  // ou de inputs do form que possam ter casas extras.
  const round2 = (n) => (n == null ? n : Math.round(Number(n) * 100) / 100);

  // Filtra apenas itens válidos da própria cotação
  const idsValidos = new Set(cotacao.itens.map((i) => i.id));
  const itensValidos = body.itens
    .filter((it) => idsValidos.has(it.cotacaoItemId) && it.precoUnit > 0)
    .map((it) => ({
      ...it,
      precoUnit: round2(it.precoUnit),
      qtdCotada: round2(it.qtdCotada),
      icmsPct: it.icmsPct != null ? round2(it.icmsPct) : null,
      ipiPct: it.ipiPct != null ? round2(it.ipiPct) : null,
    }));
  if (itensValidos.length === 0) {
    return NextResponse.json({ error: "Preencha ao menos um preço unitário." }, { status: 400 });
  }

  const total = round2(itensValidos.reduce((s, it) => s + it.precoUnit * it.qtdCotada, 0));

  // Tenta resolver o fornecedor no Omie pelo CNPJ — se achar, ja salva nCodOmie
  // pra que a geracao de pedido saiba pra quem mandar.
  const cnpjLimpo = body.cnpj ? body.cnpj.replace(/\D/g, "") : "";
  let nCodOmieResolvido = cotacao.nCodOmie || null;
  let omieLookupErro = null;
  if (cnpjLimpo && cnpjLimpo.length === 14 && !nCodOmieResolvido) {
    try {
      const r = await resolverFornecedorPorCnpj(
        cnpjLimpo,
        process.env.OMIE_APP_KEY,
        process.env.OMIE_APP_SECRET
      );
      if (r.codigo) {
        nCodOmieResolvido = String(r.codigo);
      } else {
        omieLookupErro = r.error;
      }
    } catch (e) {
      omieLookupErro = e?.message || "erro de rede";
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const it of itensValidos) {
      await tx.cotacaoItem.update({
        where: { id: it.cotacaoItemId },
        data: {
          precoUnit: it.precoUnit,
          qtdCotada: it.qtdCotada,
          icmsPct: it.icmsPct ?? null,
          ipiPct: it.ipiPct ?? null,
          observacao: it.observacao || null,
        },
      });
    }

    // Combina observações em um único campo
    const obsParts = [];
    if (body.prazoEntrega) obsParts.push(`Prazo de entrega: ${body.prazoEntrega}`);
    if (body.condicaoPagamento) obsParts.push(`Pagamento: ${body.condicaoPagamento}`);
    if (body.observacao) obsParts.push(body.observacao);
    const obsCombinada = obsParts.join(" | ") || null;

    await tx.cotacao.update({
      where: { id: cotacao.id },
      data: {
        status: "RECEBIDA",
        recebidaEm: new Date(),
        total,
        prazoPagamento: body.condicaoPagamento || null,
        observacao: obsCombinada,
        cnpj: cnpjLimpo || cotacao.cnpj,
        nCodOmie: nCodOmieResolvido || cotacao.nCodOmie,
        fornecedorNome: body.razaoSocial?.trim() || cotacao.fornecedorNome,
        ...(eRevisao ? { numeroRevisao: { increment: 1 } } : {}),
      },
    });

    // Atualiza RMItens dessa cotação pra status COTADO — APENAS itens com preço.
    // Itens que fornecedor deixou em branco/0 nao foram "cotados", ficam em
    // EM_COTACAO pro usuario decidir (re-cotar com outro fornecedor ou cancelar).
    const cotItens = await tx.cotacaoItem.findMany({
      where: { cotacaoId: cotacao.id },
      select: { rmItemId: true, precoUnit: true, rmItem: { select: { rmId: true } } },
    });
    const rmItemIdsComPreco = cotItens.filter((c) => c.precoUnit > 0).map((c) => c.rmItemId);
    if (rmItemIdsComPreco.length > 0) {
      await tx.rMItem.updateMany({
        where: {
          id: { in: rmItemIdsComPreco },
          status: "EM_COTACAO",
        },
        data: { status: "COTADO" },
      });
    }

    // Atualiza status de TODAS as RMs envolvidas (multi-RM consolidada)
    const rmIdsEnvolvidas = [...new Set(cotItens.map((c) => c.rmItem.rmId))];
    await tx.rM.updateMany({
      where: { id: { in: rmIdsEnvolvidas }, status: "EM_COTACAO" },
      data: { status: "COTADA" },
    });

    await tx.auditLog.create({
      data: {
        userId: null,
        action: eRevisao ? "revisar_cotacao_fornecedor" : "submeter_cotacao_fornecedor",
        entity: "Cotacao",
        entityId: cotacao.id,
        diff: {
          total,
          fornecedor: cotacao.fornecedorNome,
          itens: itensValidos.length,
          revisao: eRevisao ? cotacao.numeroRevisao + 1 : 0,
        },
      },
    });
  });

  return NextResponse.json({
    ok: true,
    total,
    revisao: eRevisao,
    omieResolvido: !!nCodOmieResolvido,
    omieLookupErro,
  });
}
