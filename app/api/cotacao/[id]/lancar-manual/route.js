// Lancamento manual de proposta pela tela de Compras (quando o fornecedor
// nao respondeu pelo portal e o Compras tem a proposta em mãos).
// Diferenca pra /api/cotacao/submeter/[token]:
//   - autorizada por sessao (Admin/Compras), nao por token publico
//   - identifica itens pelo rmItemId (nao cotacaoItemId) — cria/atualiza
//     CotacaoItem se nao existir
//   - resolve fornecedor no Omie pelo CNPJ (igual ao submeter)
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { resolverFornecedorPorCnpj } from "@/lib/omie-pedido-compra";

const itemSchema = z.object({
  rmItemId: z.string(),
  precoUnit: z.number().min(0),
  qtdCotada: z.number().min(0),
  icmsPct: z.number().min(0).optional().nullable(),
  ipiPct: z.number().min(0).optional().nullable(),
});

const schema = z.object({
  cnpj: z.string().min(11),
  razaoSocial: z.string().optional().nullable(),
  itens: z.array(itemSchema).min(1),
  prazoEntrega: z.string().optional().nullable(),
  condicaoPagamento: z.string().optional().nullable(),
  observacao: z.string().optional().nullable(),
  // Total declarado pelo fornecedor (PDF). Quando preenchido, vira fonte da
  // verdade — gerar-pedidos ajusta precos no Omie pra bater com esse valor.
  totalProposta: z.number().min(0).optional().nullable(),
});

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Apenas Admin ou Compras." }, { status: 403 });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados inválidos: " + e.message }, { status: 400 });
  }

  const cotacao = await prisma.cotacao.findUnique({
    where: { id: params.id },
    include: { itens: { select: { id: true, rmItemId: true } } },
  });
  if (!cotacao) return NextResponse.json({ error: "Cotação não encontrada." }, { status: 404 });
  if (cotacao.status === "CANCELADA") {
    return NextResponse.json({ error: "Cotação cancelada." }, { status: 409 });
  }

  const cnpjLimpo = body.cnpj.replace(/\D/g, "");
  if (cnpjLimpo.length !== 14) {
    return NextResponse.json({ error: "CNPJ deve ter 14 dígitos." }, { status: 400 });
  }

  // Resolve fornecedor no Omie (mesmo padrao do submeter publico)
  let nCodOmieResolvido = cotacao.nCodOmie || null;
  if (!nCodOmieResolvido) {
    try {
      const r = await resolverFornecedorPorCnpj(
        cnpjLimpo,
        process.env.OMIE_APP_KEY,
        process.env.OMIE_APP_SECRET
      );
      if (r.codigo) nCodOmieResolvido = String(r.codigo);
    } catch {}
  }

  // Mapa rmItemId -> cotacaoItemId existente (se houver)
  const cotItemPorRm = new Map();
  for (const ci of cotacao.itens) cotItemPorRm.set(ci.rmItemId, ci.id);

  // Arredonda valores numericos pra 2 casas decimais — evita "lixo" do parser IA
  // ou de inputs do form que possam ter casas extras.
  const round2 = (n) => (n == null ? n : Math.round(Number(n) * 100) / 100);

  // Itens validos: precoUnit > 0
  const itensValidos = body.itens
    .filter((it) => it.precoUnit > 0)
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
  const eRevisao = cotacao.status === "RECEBIDA";

  await prisma.$transaction(async (tx) => {
    for (const it of itensValidos) {
      const existing = cotItemPorRm.get(it.rmItemId);
      if (existing) {
        await tx.cotacaoItem.update({
          where: { id: existing },
          data: {
            precoUnit: it.precoUnit,
            qtdCotada: it.qtdCotada,
            icmsPct: it.icmsPct ?? null,
            ipiPct: it.ipiPct ?? null,
          },
        });
      } else {
        // Cria CotacaoItem novo (caso o RMItem nao estivesse na cotacao original)
        await tx.cotacaoItem.create({
          data: {
            cotacaoId: cotacao.id,
            rmItemId: it.rmItemId,
            precoUnit: it.precoUnit,
            qtdCotada: it.qtdCotada,
            icmsPct: it.icmsPct ?? null,
            ipiPct: it.ipiPct ?? null,
          },
        });
      }
    }

    const obsParts = [];
    if (body.prazoEntrega) obsParts.push(`Prazo de entrega: ${body.prazoEntrega}`);
    if (body.condicaoPagamento) obsParts.push(`Pagamento: ${body.condicaoPagamento}`);
    if (body.observacao) obsParts.push(body.observacao);
    obsParts.push("Lançada manualmente por " + user.name);
    const obsCombinada = obsParts.filter(Boolean).join(" | ");

    await tx.cotacao.update({
      where: { id: cotacao.id },
      data: {
        status: "RECEBIDA",
        recebidaEm: new Date(),
        total,
        totalProposta: body.totalProposta != null ? round2(body.totalProposta) : null,
        cnpj: cnpjLimpo,
        nCodOmie: nCodOmieResolvido || cotacao.nCodOmie,
        fornecedorNome: body.razaoSocial?.trim() || cotacao.fornecedorNome,
        prazoPagamento: body.condicaoPagamento || null,
        observacao: obsCombinada,
        ...(eRevisao ? { numeroRevisao: { increment: 1 } } : {}),
      },
    });

    // Atualiza RMItens dos itens lancados pra COTADO (se ainda EM_COTACAO/PENDENTE)
    await tx.rMItem.updateMany({
      where: {
        id: { in: itensValidos.map((it) => it.rmItemId) },
        status: { in: ["PENDENTE", "EM_COTACAO"] },
      },
      data: { status: "COTADO" },
    });

    // Atualiza status de TODAS as RMs envolvidas (multi-RM consolidada).
    // Descobre rmIds via rmItens lancados nessa proposta.
    const rmIdsEnvolvidas = await tx.rMItem.findMany({
      where: { id: { in: itensValidos.map((it) => it.rmItemId) } },
      select: { rmId: true },
    });
    const rmIdsUnicos = [...new Set(rmIdsEnvolvidas.map((r) => r.rmId))];
    await tx.rM.updateMany({
      where: { id: { in: rmIdsUnicos }, status: { in: ["ABERTA", "EM_COTACAO"] } },
      data: { status: "COTADA" },
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: eRevisao ? "lancar_manual_revisao" : "lancar_manual",
        entity: "Cotacao",
        entityId: cotacao.id,
        diff: { total, fornecedor: body.razaoSocial, cnpj: cnpjLimpo, itens: itensValidos.length },
      },
    });
  });

  return NextResponse.json({ ok: true, total });
}
