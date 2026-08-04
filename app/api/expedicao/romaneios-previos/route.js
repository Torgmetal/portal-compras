// GET — fila consolidada de pré-romaneios (RomaneioPrevio) de TODAS as OPs abertas,
// pra aba "Romaneios" da Expedição. É o mesmo que a Expedição vê dentro do módulo
// OPs (por OP), só que reunido num lugar só — o que o Planejamento cria já aparece
// aqui. Só os NÃO emitidos (fila pra emitir); depois de emitido vira romaneio e sai
// desta lista (aparece no Fiscal / pasta do SharePoint).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ROLES = ["ADMIN", "EXPEDICAO", "PRODUCAO", "COMERCIAL"];

export async function GET(_req) {
  try { await requireRole(ROLES); } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const rows = await prisma.romaneioPrevio.findMany({
    where: {
      status: { not: "CANCELADO" },
      emitidoEm: null, // só pré-romaneios; emitido vira romaneio e sai desta fila
      op: { status: { notIn: ["ENCERRADA", "CANCELADA"] } },
    },
    select: {
      id: true, opId: true, opNumero: true, numero: true, status: true,
      dataPrevista: true, local: true, pesoKg: true, itens: true,
      aprovadoEm: true, createdAt: true,
      op: { select: { id: true, numero: true, cliente: true, obra: true } },
    },
  });

  const previos = rows.map((r) => ({
    id: r.id, opId: r.opId, op: r.op,
    numero: r.numero,
    itensCount: Array.isArray(r.itens) ? r.itens.length : 0,
    pesoKg: r.pesoKg ?? 0,
    dataPrevista: r.dataPrevista, local: r.local,
    situacao: r.status === "APROVADO" ? "APROVADO" : "PREVISTO",
    aprovadoEm: r.aprovadoEm,
    createdAt: r.createdAt,
  }));

  // Ordena por data prevista (sem data por último); empate = mais recente primeiro.
  previos.sort((a, b) => {
    const da = a.dataPrevista ? new Date(a.dataPrevista).getTime() : Infinity;
    const db = b.dataPrevista ? new Date(b.dataPrevista).getTime() : Infinity;
    if (da !== db) return da - db;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return NextResponse.json({ success: true, previos });
}
