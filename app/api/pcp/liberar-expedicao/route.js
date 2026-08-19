// POST /api/pcp/liberar-expedicao
//
// Direciona peças da raia de EXPEDIÇÃO pro portal da Expedição, em lote.
//
// Vitor (19/08/2026): "na página expedição já não [é] mais para liberar para produção e sim já
// liberar para expedição — é aqui que começamos a direcionar as peças que precisam ser enviadas,
// daqui pode aparecer no portal da expedição essas informações".
//
// O caminho pro portal da Expedição já existia, só que começava em outra tela
// (/planejamento/expedicao-semanal). São duas coisas que precisam existir juntas:
//   1. `ConjuntoEntrega` por peça — quanto vai pra qual destino (é o que a Expedição romaneia);
//   2. `PedidoExpedicao` da obra — é o que faz a OP aparecer na fila da Expedição.
// Uma sem a outra não mostra nada: pedido sem entrega é uma OP vazia na fila, entrega sem pedido
// é peça direcionada que ninguém vê.
//
// ⚠ NÃO SOBRESCREVE divisão que já existe. Se a peça já foi repartida entre destinos (na Expedição
// Semanal), ela é PULADA e volta na resposta — reescrever apagaria a divisão que alguém fez à mão,
// e o erro só apareceria no romaneio errado, lá na frente.
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

const schema = z.object({
  opId: z.string().min(1),
  opNumero: z.string().min(1),
  destino: z.string().trim().min(1, "Informe o destino").max(200),
  ids: z.array(z.string().min(1)).min(1, "Selecione ao menos uma peça").max(2000),
  observacao: z.string().max(500).optional().nullable(),
});

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO", "EXPEDICAO"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const todas = await prisma.pecaConjunto.findMany({
    where: { id: { in: body.ids }, opId: body.opId },
    select: { id: true, marca: true, qte: true, tipoPeca: true, entregas: { select: { id: true, destino: true, quantidade: true } } },
  });
  if (!todas.length) return NextResponse.json({ error: "Nenhuma peça encontrada nesta OP." }, { status: 404 });

  // 🚫 CROQUI NÃO SE EXPEDE — nunca. Vitor (19/08/2026): "nesse caso da OP-67 não vai expedir
  // nenhum croqui, aliás nunca vamos expedir um croqui". O croqui é peça de fabricação: vira parte
  // de um conjunto, e é o CONJUNTO que embarca. Por isso o portal da Expedição lê só CONJUNTO (ou
  // peça sem tipo, que é legado da LE antiga) — ver /api/expedicao/pedidos.
  //
  // Não é filtro defensivo, é a regra do negócio. Fica aqui porque a raia de Expedição lista os
  // dois juntos (a OP-067 tem 2.594 croquis ao lado de 1.330 conjuntos): sem o corte, um croqui
  // selecionado por engano ganharia destino gravado e invisível pra quem embarca — pior que não
  // fazer nada, porque parece feito. Volta na resposta com marca e tudo.
  const foraDoPortal = todas.filter((p) => p.tipoPeca && p.tipoPeca !== "CONJUNTO");
  const pecas = todas.filter((p) => !p.tipoPeca || p.tipoPeca === "CONJUNTO");

  const jaTinham = pecas.filter((p) => p.entregas.length > 0);
  const novas = pecas.filter((p) => p.entregas.length === 0 && (p.qte || 0) > 0);
  const semQtd = pecas.filter((p) => p.entregas.length === 0 && !(p.qte > 0));

  if (!novas.length && !jaTinham.length) {
    return NextResponse.json({
      error: foraDoPortal.length
        ? `Nenhuma das ${todas.length} peça(s) pode ir pro portal da Expedição: são croquis/peças avulsas, e a Expedição embarca CONJUNTOS.`
        : "Nenhuma peça elegível na seleção.",
      foraDoPortal: foraDoPortal.map((p) => p.marca),
    }, { status: 400 });
  }

  if (novas.length) {
    await prisma.conjuntoEntrega.createMany({
      data: novas.map((p) => ({ pecaConjuntoId: p.id, destino: body.destino.trim(), quantidade: p.qte })),
    });
  }

  // O pedido da obra sobe junto — é ele que põe a OP na fila da Expedição. Se já existe e está
  // CONCLUIDO, volta pra ENVIADO: entrou peça nova, a obra voltou pra fila.
  const existente = await prisma.pedidoExpedicao.findUnique({ where: { opNumero: body.opNumero }, select: { status: true } });
  const pedido = await prisma.pedidoExpedicao.upsert({
    where: { opNumero: body.opNumero },
    create: {
      opNumero: body.opNumero, opId: body.opId, status: "ENVIADO",
      enviadoPorId: user.id, observacao: body.observacao || null,
    },
    update: {
      opId: body.opId,
      ...(existente?.status === "CONCLUIDO" ? { status: "ENVIADO", enviadoPorId: user.id } : {}),
      ...(body.observacao ? { observacao: body.observacao } : {}),
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id, action: "liberar_expedicao", entity: "OP", entityId: body.opId,
      diff: { opNumero: body.opNumero, destino: body.destino, direcionadas: novas.length, jaTinhamDestino: jaTinham.length, foraDoPortal: foraDoPortal.length },
    },
  });

  revalidatePath("/expedicao");
  revalidatePath("/planejamento/expedicao-semanal");

  return NextResponse.json({
    ok: true,
    pedidoStatus: pedido.status,
    direcionadas: novas.length,
    // devolvidas por nome pra pessoa conferir na hora, não só um número
    jaTinhamDestino: jaTinham.map((p) => ({ marca: p.marca, destinos: p.entregas.map((e) => `${e.destino} (${e.quantidade})`) })),
    semQuantidade: semQtd.map((p) => p.marca),
    foraDoPortal: foraDoPortal.map((p) => ({ marca: p.marca, tipo: p.tipoPeca })),
  });
}

// GET ?opId= — destinos já usados na obra, pra sugerir em vez de digitar de novo (e evitar
// "PÁTIO 1" e "Patio 1" virarem dois destinos diferentes no romaneio).
export async function GET(req) {
  try { await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO", "EXPEDICAO"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const opId = new URL(req.url).searchParams.get("opId");
  if (!opId) return NextResponse.json({ destinos: [] });

  const rows = await prisma.conjuntoEntrega.findMany({
    where: { pecaConjunto: { opId } },
    select: { destino: true },
    distinct: ["destino"],
    orderBy: { destino: "asc" },
  });
  return NextResponse.json({ destinos: rows.map((r) => r.destino).filter(Boolean) });
}
