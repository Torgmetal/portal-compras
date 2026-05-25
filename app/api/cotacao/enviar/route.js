import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const fornecedorSchema = z.object({
  nome: z.string().min(1),
  email: z.string().email(),
  cnpj: z.string().optional().nullable(),
  nCodOmie: z.string().optional().nullable(),
});

// Aceita 1 ou mais RMs (consolida itens de várias RMs num envio só pro fornecedor).
const schema = z.object({
  // Pode vir só rmId (legado) ou rmIds (multi-RM)
  rmId: z.string().optional(),
  rmIds: z.array(z.string()).optional(),
  itensIds: z.array(z.string()).min(1),
  fornecedores: z.array(fornecedorSchema).min(1),
  prazoResposta: z.string().optional().nullable(),
  observacaoExtra: z.string().optional().nullable(),
});

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Apenas Admin ou Compras pode enviar cotação." }, { status: 403 });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados inválidos: " + e.message }, { status: 400 });
  }

  // Normaliza rmIds: aceita rmIds[] OU rmId único
  const rmIds = body.rmIds && body.rmIds.length > 0
    ? body.rmIds
    : (body.rmId ? [body.rmId] : []);
  if (rmIds.length === 0) {
    return NextResponse.json({ error: "Informe ao menos uma RM (rmId ou rmIds)." }, { status: 400 });
  }

  // Busca todas as RMs envolvidas
  const rms = await prisma.rM.findMany({
    where: { id: { in: rmIds } },
    include: { itens: true },
  });
  if (rms.length === 0) return NextResponse.json({ error: "RM(s) não encontrada(s)." }, { status: 404 });
  if (rms.length !== rmIds.length) {
    return NextResponse.json({ error: "Alguma RM não foi encontrada." }, { status: 404 });
  }

  // Coleta todos os itens das RMs e filtra os selecionados
  const todosItens = rms.flatMap((r) => r.itens);
  const itensValidos = todosItens.filter((it) => body.itensIds.includes(it.id));
  if (itensValidos.length === 0) {
    return NextResponse.json({ error: "Nenhum item válido pra cotar." }, { status: 400 });
  }

  const itensCotaveis = itensValidos.filter(
    (it) => it.status === "PENDENTE" || it.status === "EM_COTACAO" || it.status === "COTADO"
  );
  if (itensCotaveis.length === 0) {
    return NextResponse.json(
      { error: "Itens selecionados já viraram pedido ou foram cancelados — não dá pra cotar de novo." },
      { status: 409 }
    );
  }

  const prazo = body.prazoResposta ? new Date(body.prazoResposta) : null;
  // RM principal (1ª da lista — a Cotacao guarda só uma referência direta de RM,
  // as demais ficam vinculadas via os CotacaoItens que apontam pra rmItemId delas).
  const rmPrincipal = rms.find((r) => r.id === rmIds[0]) || rms[0];

  let cotacoesCriadas = [];
  await prisma.$transaction(async (tx) => {
    // Cria todas as cotações (uma por fornecedor) em paralelo
    cotacoesCriadas = await Promise.all(body.fornecedores.map(async (f) => {
      const token = randomUUID();
      const cot = await tx.cotacao.create({
        data: {
          rmId: rmPrincipal.id,
          fornecedorNome: f.nome,
          fornecedorEmail: f.email,
          cnpj: f.cnpj || null,
          nCodOmie: f.nCodOmie || null,
          prazoResposta: prazo,
          observacao: body.observacaoExtra || null,
          token,
          status: "PENDENTE",
          itens: {
            create: itensCotaveis.map((it) => {
              const peso = Number(it.peso) || 0;
              return {
                rmItemId: it.id,
                precoUnit: 0,
                qtdCotada: peso > 0 ? peso : it.qtd,
              };
            }),
          },
        },
      });
      // Registra envio em todas as RMs envolvidas (paralelo por RM)
      await Promise.all(rms.map((rm) =>
        tx.envio.create({
          data: { rmId: rm.id, fornecedorNome: f.nome, fornecedorEmail: f.email },
        })
      ));
      return {
        id: cot.id,
        token: cot.token,
        fornecedorNome: f.nome,
        fornecedorEmail: f.email,
        rmsVinculadas: rms.map((r) => r.numero),
      };
    }));

    // Marca itens PENDENTES como EM_COTACAO
    await tx.rMItem.updateMany({
      where: {
        id: { in: itensCotaveis.map((i) => i.id) },
        status: "PENDENTE",
      },
      data: { status: "EM_COTACAO" },
    });

    // Atualiza status das RMs que estavam ABERTA para EM_COTACAO (batch)
    const rmIdsAberta = rms.filter((rm) => rm.status === "ABERTA").map((rm) => rm.id);
    if (rmIdsAberta.length > 0) {
      await tx.rM.updateMany({
        where: { id: { in: rmIdsAberta } },
        data: { status: "EM_COTACAO" },
      });
    }

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "enviar_cotacao",
        entity: "RM",
        entityId: rmPrincipal.id,
        diff: {
          rmsVinculadas: rms.map((r) => r.numero),
          fornecedores: body.fornecedores.length,
          itens: itensCotaveis.length,
          prazo: body.prazoResposta || null,
        },
      },
    });
  });

  return NextResponse.json({ ok: true, cotacoes: cotacoesCriadas });
}
