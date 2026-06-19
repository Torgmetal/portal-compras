// GET /api/producao/pecas/terceirizados[?op=NNN]
// Alimenta a tela de Serviço Terceirizado do PCP:
//  - aguardando: peças marcadas (status TERCEIRIZADO), esperando o recebimento
//  - recebidas:  já liberadas pro destino (terceirizado + recebidoEm)
//  - markaveis:  peças da OP informada ainda não avançadas (PENDENTE/CORTE) p/ marcar
//  - ops:        OPs que têm peças marcáveis (para o seletor)
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

const SEL = { id: true, opNumero: true, marca: true, descricao: true, qte: true, pesoTotalKg: true, tipoPeca: true, status: true, destinoTerceirizado: true, terceirizadoRecebidoEm: true };

export async function GET(req) {
  try {
    await requireRole(["ADMIN", "COMPRAS", "PCP", "PLANEJAMENTO", "PRODUCAO"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const op = new URL(req.url).searchParams.get("op");

  const [aguardando, recebidas, opsRaw, markaveis] = await Promise.all([
    prisma.pecaConjunto.findMany({ where: { status: "TERCEIRIZADO" }, select: SEL, orderBy: [{ opNumero: "asc" }, { marca: "asc" }] }),
    prisma.pecaConjunto.findMany({ where: { terceirizado: true, terceirizadoRecebidoEm: { not: null } }, select: SEL, orderBy: { terceirizadoRecebidoEm: "desc" }, take: 100 }),
    prisma.pecaConjunto.findMany({ where: { status: { in: ["PENDENTE", "CORTE"] } }, select: { opNumero: true }, distinct: ["opNumero"], orderBy: { opNumero: "asc" } }),
    op ? prisma.pecaConjunto.findMany({ where: { opNumero: op, status: { in: ["PENDENTE", "CORTE"] } }, select: SEL, orderBy: { marca: "asc" } }) : Promise.resolve([]),
  ]);

  return NextResponse.json({
    aguardando,
    recebidas,
    markaveis,
    ops: opsRaw.map((o) => o.opNumero).filter(Boolean),
  });
}
