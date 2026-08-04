// GET — fila consolidada de pré-romaneios (RomaneioPrevio) de TODAS as OPs abertas,
// pra aba "Romaneios" da Expedição. É o mesmo que a Expedição vê dentro do módulo
// OPs (por OP), só que reunido num lugar só — o que o Planejamento cria já aparece
// aqui. Não emitidos primeiro (fila de trabalho), depois emitidos.
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
      op: { status: { notIn: ["ENCERRADA", "CANCELADA"] } },
    },
    select: {
      id: true, opId: true, opNumero: true, numero: true, status: true,
      dataPrevista: true, local: true, pesoKg: true, itens: true, revisao: true,
      aprovadoEm: true, emitidoEm: true, arquivoUrl: true, nfNumero: true, nfTipo: true,
      createdAt: true,
      op: { select: { id: true, numero: true, cliente: true, obra: true } },
    },
  });

  const previos = rows.map((r) => {
    const emitido = !!r.emitidoEm;
    const situacao = emitido ? "EMITIDO" : (r.status === "APROVADO" ? "APROVADO" : "PREVISTO");
    return {
      id: r.id, opId: r.opId, op: r.op,
      numero: r.numero,
      revisao: r.revisao ?? 0,
      itensCount: Array.isArray(r.itens) ? r.itens.length : 0,
      pesoKg: r.pesoKg ?? 0,
      dataPrevista: r.dataPrevista, local: r.local,
      situacao, emitido, emitidoEm: r.emitidoEm, aprovadoEm: r.aprovadoEm,
      arquivoUrl: r.arquivoUrl, nfNumero: r.nfNumero, nfTipo: r.nfTipo,
      createdAt: r.createdAt,
    };
  });

  // Ordena: não emitidos primeiro (fila), depois por data prevista / criação (mais recente).
  const rank = { PREVISTO: 0, APROVADO: 1, EMITIDO: 2 };
  previos.sort((a, b) => {
    if (rank[a.situacao] !== rank[b.situacao]) return rank[a.situacao] - rank[b.situacao];
    const da = a.dataPrevista ? new Date(a.dataPrevista).getTime() : (a.emitido ? -Infinity : Infinity);
    const db = b.dataPrevista ? new Date(b.dataPrevista).getTime() : (b.emitido ? -Infinity : Infinity);
    if (da !== db) return da - db;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return NextResponse.json({ success: true, previos });
}
