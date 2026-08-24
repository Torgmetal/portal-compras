// GET — romaneios emitidos (RomaneioPrevio.emitidoEm != null) pra aba Fiscal.
// A fila do departamento fiscal: aguardando NF (sem nº) × finalizados (nº + tipo).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ROLES = ["ADMIN", "FISCAL", "FINANCEIRO"];

export async function GET(req) {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const status = new URL(req.url).searchParams.get("status") || "todos";
  const where = { emitidoEm: { not: null } };
  if (status === "aguardando") where.nfNumero = null;
  else if (status === "finalizado") where.nfNumero = { not: null };

  const rows = await prisma.romaneioPrevio.findMany({
    where,
    orderBy: [{ emitidoEm: "desc" }],
    select: {
      id: true, numero: true, revisao: true, pesoKg: true, emitidoEm: true, arquivoUrl: true, itens: true,
      nfNumero: true, nfTipo: true, nfEmitidaEm: true, nfObservacao: true,
      nfPedidoOmie: true, nfPedidoNumero: true, nfSerie: true, nfChave: true, nfErroEmissao: true,
      op: { select: { id: true, numero: true, cliente: true, obra: true, clienteCnpj: true, clienteUF: true } },
      lote: { select: { nome: true, transportadora: true, placaVeiculo: true, placaCarreta: true } },
    },
  });

  const romaneios = rows.map(({ itens, ...r }) => ({
    ...r,
    itensCount: Array.isArray(itens) ? itens.length : 0,
    finalizado: !!(r.nfNumero && r.nfTipo),
  }));
  return NextResponse.json({ success: true, romaneios });
}
