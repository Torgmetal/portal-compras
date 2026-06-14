// GET /api/expedicao/pedidos
// Fila de expedição: OPs que o Planejamento enviou (PedidoExpedicao). Para cada
// uma, as entregas vivas dos conjuntos agrupadas por DESTINO (o que romanear por
// local) + os romaneios já criados da OP.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export async function GET() {
  try {
    await requireRole(["ADMIN", "EXPEDICAO", "PRODUCAO", "COMERCIAL", "PLANEJAMENTO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  const pedidos = await prisma.pedidoExpedicao.findMany({
    where: { status: { in: ["ENVIADO", "EM_EXPEDICAO"] } },
    orderBy: { enviadoEm: "desc" },
  });
  if (pedidos.length === 0) return NextResponse.json({ pedidos: [] });

  const numeros = pedidos.map((p) => p.opNumero);

  const ops = await prisma.oP.findMany({
    where: { numero: { in: numeros } },
    select: {
      id: true, numero: true, cliente: true, obra: true,
      pecasConjunto: {
        where: { OR: [{ tipoPeca: "CONJUNTO" }, { tipoPeca: null }] },
        select: {
          id: true, marca: true, descricao: true, qte: true, pesoUnitKg: true, pesoTotalKg: true, status: true,
          entregas: { select: { id: true, destino: true, quantidade: true } },
        },
      },
    },
  });
  const opMap = {};
  for (const o of ops) opMap[o.numero] = o;

  const opIds = ops.map((o) => o.id);
  const romaneios = opIds.length
    ? await prisma.romaneio.findMany({
        where: { opId: { in: opIds } },
        select: {
          id: true, numero: true, opId: true, destino: true, data: true, pesoRealKg: true,
          transportadora: true, motorista: true, placaVeiculo: true, nfStatus: true, nfNumero: true,
        },
        orderBy: { data: "desc" },
      })
    : [];

  const out = pedidos.map((ped) => {
    const op = opMap[ped.opNumero];
    const porDestino = {};
    if (op) {
      for (const pc of op.pecasConjunto) {
        const pesoUnit = pc.pesoUnitKg || (pc.qte > 0 ? pc.pesoTotalKg / pc.qte : 0);
        for (const e of pc.entregas || []) {
          const d = (porDestino[e.destino] = porDestino[e.destino] || { destino: e.destino, itens: [], totalUn: 0, totalKg: 0 });
          const pesoKg = pesoUnit * e.quantidade;
          d.itens.push({
            pecaConjuntoId: pc.id, marca: pc.marca, descricao: pc.descricao,
            quantidade: e.quantidade, pesoUnit, pesoKg, status: pc.status,
          });
          d.totalUn += e.quantidade;
          d.totalKg += pesoKg;
        }
      }
    }
    return {
      opNumero: ped.opNumero,
      opId: op?.id || ped.opId || null,
      cliente: op?.cliente || null,
      obra: op?.obra || null,
      status: ped.status,
      enviadoEm: ped.enviadoEm,
      observacao: ped.observacao,
      destinos: Object.values(porDestino).sort((a, b) => String(a.destino).localeCompare(String(b.destino))),
      romaneios: op ? romaneios.filter((r) => r.opId === op.id) : [],
    };
  });

  return NextResponse.json({ pedidos: out });
}
