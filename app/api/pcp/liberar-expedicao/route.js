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
    select: { id: true, marca: true, qte: true, tipoPeca: true, status: true, entregas: { select: { id: true, destino: true, quantidade: true } } },
  });
  if (!todas.length) return NextResponse.json({ error: "Nenhuma peça encontrada nesta OP." }, { status: 404 });

  // 🚫 CROQUI NÃO SE EXPEDE — nunca. Vitor (19/08/2026): "nunca vamos expedir um croqui". O croqui
  // é peça de fabricação: vira parte de um conjunto, e é o CONJUNTO que embarca. Na base inteira há
  // 19.398 relações conjunto↔croqui e só 9 croquis com status EXPEDIDO (esses 9 cheiram a erro de
  // dado).
  //
  // ⚠ CROQUI ≠ AVULSA, e a diferença mora justamente no `tipoPeca` nulo. Vitor perguntou —
  // "lembra que temos as peças avulsas, será que são essas que você está chamando de croqui?" — e a
  // resposta é não:
  //     tipoPeca "CONJUNTO" → conjunto, embarca
  //     tipoPeca  null      → PEÇA AVULSA (solo da LPC), embarca — 2.728 já expedidas na base
  //     tipoPeca "CROQUI"   → compõe conjunto, NÃO embarca
  // Por isso a condição é `!tipoPeca || tipoPeca === "CONJUNTO"`: o nulo tem de PASSAR. Trocar por
  // `tipoPeca === "CONJUNTO"` só, achando que nulo é lixo de dado, tiraria as avulsas do embarque.
  // (É a mesma leitura de /api/producao/mapa: `conjOuAvulsa = CONJUNTO ou null`.)
  //
  // O corte fica aqui porque a raia de Expedição lista os três juntos (a OP-067 tem 2.594 croquis
  // ao lado de 1.330 conjuntos e 860 avulsas): sem ele, um croqui selecionado por engano ganharia
  // destino gravado e invisível pra quem embarca — pior que não fazer nada, porque parece feito.
  const foraDoPortal = todas.filter((p) => p.tipoPeca && p.tipoPeca !== "CONJUNTO");
  const pecas = todas.filter((p) => !p.tipoPeca || p.tipoPeca === "CONJUNTO");

  // ── JÁ EMBARCOU? Três sinais, e vale QUALQUER um deles ───────────────────────────────────
  //
  // Vitor (19/08/2026): "nessa parte você está considerando o que já foi dado baixa dos romaneios
  // do SharePoint?". Não estava — e era furo de verdade: a OP-067 tem 1.435 peças já expedidas na
  // raia, e liberar de novo mandaria pro portal da Expedição carga que já saiu do pátio.
  //
  //   1. `status = "EXPEDIDO"` na peça — a baixa do portal;
  //   2. `RomaneioItem` — a peça já entrou num romaneio emitido daqui;
  //   3. marca baixada na LISTA DE EXPEDIÇÃO (`expedidoRomaneio`/`expedidoArquivo`) — é o
  //      SharePoint, o registro do que fisicamente saiu, inclusive de obra antiga que foi
  //      romaneada fora do portal.
  //
  // Os três porque cada um enxerga um pedaço: o status é do portal, o RomaneioItem é do romaneio
  // daqui, e a lista é do que a Expedição fechou lá. Na OP-067 eles concordam (zero divergência),
  // mas concordar hoje não é garantia — obra migrada tem baixa só na lista.
  const idsEmbarcadas = new Set(pecas.filter((p) => p.status === "EXPEDIDO").map((p) => p.id));

  for (const ri of await prisma.romaneioItem.findMany({
    where: { pecaConjuntoId: { in: pecas.map((p) => p.id) } },
    select: { pecaConjuntoId: true },
    distinct: ["pecaConjuntoId"],
  })) idsEmbarcadas.add(ri.pecaConjuntoId);

  const cru = String(body.opNumero).replace(/^T/i, "").replace(/^0+/, "");
  const listas = await prisma.listaExpedicao.findMany({
    where: { OR: [{ opId: body.opId }, { opNumero: { in: [...new Set([body.opNumero, cru, cru.padStart(3, "0"), `T${cru}`, `T${cru.padStart(3, "0")}`])] } }] },
    select: { marcasJson: true },
  });
  const marcasBaixadas = new Set();
  for (const l of listas) {
    for (const m of Array.isArray(l.marcasJson) ? l.marcasJson : []) {
      if (m?.expedidoRomaneio || m?.expedidoArquivo) marcasBaixadas.add(String(m.marca || "").trim().toUpperCase());
    }
  }
  for (const p of pecas) if (marcasBaixadas.has(String(p.marca || "").trim().toUpperCase())) idsEmbarcadas.add(p.id);

  const jaEmbarcadas = pecas.filter((p) => idsEmbarcadas.has(p.id));
  const disponiveis = pecas.filter((p) => !idsEmbarcadas.has(p.id));

  const jaTinham = disponiveis.filter((p) => p.entregas.length > 0);
  const novas = disponiveis.filter((p) => p.entregas.length === 0 && (p.qte || 0) > 0);
  const semQtd = disponiveis.filter((p) => p.entregas.length === 0 && !(p.qte > 0));

  if (!novas.length && !jaTinham.length) {
    const motivos = [
      jaEmbarcadas.length ? `${jaEmbarcadas.length} já embarcada(s)` : null,
      foraDoPortal.length ? `${foraDoPortal.length} croqui(s) (croqui não se expede)` : null,
    ].filter(Boolean);
    return NextResponse.json({
      error: motivos.length
        ? `Nada a liberar nas ${todas.length} peça(s) selecionadas: ${motivos.join(" · ")}.`
        : "Nenhuma peça elegível na seleção.",
      jaEmbarcadas: jaEmbarcadas.map((p) => p.marca),
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
      diff: { opNumero: body.opNumero, destino: body.destino, direcionadas: novas.length, jaTinhamDestino: jaTinham.length, foraDoPortal: foraDoPortal.length, jaEmbarcadas: jaEmbarcadas.length },
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
    jaEmbarcadas: jaEmbarcadas.map((p) => p.marca),
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
