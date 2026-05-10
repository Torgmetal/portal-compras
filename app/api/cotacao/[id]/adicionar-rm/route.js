import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

// POST — adiciona itens de OUTRAS RMs a uma cotacao ja existente.
// Util quando o Compras esqueceu de vincular uma RM no envio inicial.
// Os novos itens viram CotacaoItens com preco=0 (fornecedor preenche).
const schema = z.object({
  rmIds: z.array(z.string()).min(1),
  itensIds: z.array(z.string()).min(1).optional(), // se vazio, pega TODOS itens cotaveis das RMs
});

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao." }, { status: 403 });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados invalidos: " + e.message }, { status: 400 });
  }

  const cotacao = await prisma.cotacao.findUnique({
    where: { id: params.id },
    include: {
      itens: { select: { id: true, rmItemId: true } },
      rm: { select: { id: true, numero: true } },
    },
  });
  if (!cotacao) return NextResponse.json({ error: "Cotacao nao encontrada." }, { status: 404 });

  // Cotacao ja faturada (gerou pedido) ou cancelada — bloqueia
  if (cotacao.status === "PEDIDO_GERADO" || cotacao.status === "CANCELADA") {
    return NextResponse.json(
      { error: "Cotacao ja foi finalizada (" + cotacao.status + "). Crie nova cotacao." },
      { status: 409 }
    );
  }

  // Busca as RMs
  const rms = await prisma.rM.findMany({
    where: { id: { in: body.rmIds } },
    include: { itens: true },
  });
  if (rms.length === 0) return NextResponse.json({ error: "RM(s) nao encontrada(s)." }, { status: 404 });
  if (rms.length !== body.rmIds.length) {
    return NextResponse.json({ error: "Alguma RM nao foi encontrada." }, { status: 404 });
  }

  // Coleta itens cotaveis (PENDENTE/EM_COTACAO/COTADO) das RMs
  let novosItens = rms.flatMap((r) => r.itens).filter(
    (it) => ["PENDENTE", "EM_COTACAO", "COTADO"].includes(it.status)
  );
  // Se vier itensIds especifico, filtra
  if (body.itensIds && body.itensIds.length > 0) {
    const set = new Set(body.itensIds);
    novosItens = novosItens.filter((it) => set.has(it.id));
  }

  // Tira os ja vinculados a essa cotacao
  const jaVinculadosIds = new Set(cotacao.itens.map((ci) => ci.rmItemId));
  const itensParaCriar = novosItens.filter((it) => !jaVinculadosIds.has(it.id));

  if (itensParaCriar.length === 0) {
    return NextResponse.json(
      { error: "Todos os itens dessas RMs ja estao vinculados nessa cotacao." },
      { status: 409 }
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.cotacaoItem.createMany({
      data: itensParaCriar.map((it) => {
        const peso = Number(it.peso) || 0;
        return {
          cotacaoId: cotacao.id,
          rmItemId: it.id,
          precoUnit: 0,
          qtdCotada: peso > 0 ? peso : it.qtd,
        };
      }),
    });

    // Marca itens PENDENTE como EM_COTACAO
    await tx.rMItem.updateMany({
      where: {
        id: { in: itensParaCriar.map((i) => i.id) },
        status: "PENDENTE",
      },
      data: { status: "EM_COTACAO" },
    });

    // Atualiza status das RMs ABERTAS pra EM_COTACAO
    for (const rm of rms) {
      if (rm.status === "ABERTA") {
        await tx.rM.update({ where: { id: rm.id }, data: { status: "EM_COTACAO" } });
      }
    }

    // Cota vai voltar pra PENDENTE pra fornecedor poder revisar (se ja recebeu, vira RECEBIDA->PENDENTE)
    if (cotacao.status === "RECEBIDA") {
      await tx.cotacao.update({
        where: { id: cotacao.id },
        data: { status: "PENDENTE" },
      });
    }

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "adicionar_rm_cotacao",
        entity: "Cotacao",
        entityId: cotacao.id,
        diff: {
          cotacaoFornecedor: cotacao.fornecedorNome,
          rmsAdicionadas: rms.map((r) => r.numero),
          itensCriados: itensParaCriar.length,
        },
      },
    });
  });

  return NextResponse.json({
    ok: true,
    itensCriados: itensParaCriar.length,
    rmsAdicionadas: rms.map((r) => r.numero),
  });
}
