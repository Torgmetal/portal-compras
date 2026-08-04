// GET — indicadores da aba Romaneios (Expedição), a partir dos RomaneioPrevio.
// Emitido (emitidoEm != null) = romaneio expedido. Fila = não emitidos.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ROLES = ["ADMIN", "EXPEDICAO", "PRODUCAO", "COMERCIAL"];

// Início da semana (segunda) e do mês, ancorados no fuso de São Paulo.
function limites() {
  const ymd = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); // YYYY-MM-DD
  const [y, m, d] = ymd.split("-").map(Number);
  const hoje = new Date(Date.UTC(y, m - 1, d));
  const dow = hoje.getUTCDay(); // 0=dom
  const diffSeg = (dow + 6) % 7; // dias desde segunda
  const inicioSemana = new Date(hoje); inicioSemana.setUTCDate(hoje.getUTCDate() - diffSeg);
  const inicioMes = new Date(Date.UTC(y, m - 1, 1));
  return { hoje, inicioSemana, inicioMes };
}

export async function GET() {
  try { await requireRole(ROLES); } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }
  const { hoje, inicioSemana, inicioMes } = limites();
  const opAberta = { status: { notIn: ["ENCERRADA", "CANCELADA"] } };

  const [pendentes, atrasados, semana, mes] = await Promise.all([
    prisma.romaneioPrevio.aggregate({
      _count: { _all: true }, _sum: { pesoKg: true },
      where: { emitidoEm: null, status: { not: "CANCELADO" }, op: opAberta },
    }),
    prisma.romaneioPrevio.count({
      where: { emitidoEm: null, status: { not: "CANCELADO" }, op: opAberta, dataPrevista: { lt: hoje } },
    }),
    prisma.romaneioPrevio.aggregate({
      _count: { _all: true }, _sum: { pesoKg: true },
      where: { emitidoEm: { gte: inicioSemana } },
    }),
    prisma.romaneioPrevio.aggregate({
      _count: { _all: true }, _sum: { pesoKg: true },
      where: { emitidoEm: { gte: inicioMes } },
    }),
  ]);

  return NextResponse.json({
    success: true,
    indicadores: {
      pendentes: { qtd: pendentes._count._all, pesoKg: pendentes._sum.pesoKg || 0 },
      atrasados: { qtd: atrasados },
      semana: { qtd: semana._count._all, pesoKg: semana._sum.pesoKg || 0 },
      mes: { qtd: mes._count._all, pesoKg: mes._sum.pesoKg || 0 },
    },
  });
}
