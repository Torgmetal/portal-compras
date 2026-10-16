// GET /api/admin/engenharia-ia — o que a tela de Admin do portão mostra (só o ADMIN do portal): aparelhos (menos os
// que ainda estão pareando), projetistas da Engenharia com teto e gasto do mês, e os últimos usos COM o pedido.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminDoPortal } from "@/lib/session";
import { inicioDoMesSP } from "@/lib/ia-engenharia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try { await requireAdminDoPortal(); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const [aparelhos, modulos, limites, gastos, usos] = await Promise.all([
    prisma.iaAparelho.findMany({ where: { status: { not: "PAREANDO" } }, orderBy: { createdAt: "desc" }, take: 200,
      select: { id: true, nome: true, userId: true, status: true, aprovadoEm: true, revogadoEm: true, ultimoUsoEm: true, createdAt: true } }),
    prisma.userModulo.findMany({ where: { modulo: "ENGENHARIA" }, select: { userId: true } }),
    prisma.iaLimite.findMany({ select: { userId: true, tetoMensalBrl: true } }),
    prisma.iaUso.groupBy({ by: ["userId"], where: { createdAt: { gte: inicioDoMesSP() } }, _sum: { custoBrl: true, custoUsd: true }, _count: { _all: true } }),
    prisma.iaUso.findMany({ orderBy: { createdAt: "desc" }, take: 150,
      select: { id: true, userId: true, aparelhoId: true, modelo: true, situacao: true, inputTokens: true, outputTokens: true, cacheReadTokens: true, custoBrl: true, pedido: true, createdAt: true } }),
  ]);
  const ids = [...new Set([...modulos.map((m) => m.userId), ...limites.map((l) => l.userId), ...aparelhos.map((a) => a.userId), ...usos.map((u) => u.userId)].filter(Boolean))];
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true, ativo: true } });
  const nome = new Map(users.map((u) => [u.id, u.name || u.email]));
  const teto = new Map(limites.map((l) => [l.userId, l.tetoMensalBrl]));
  const gasto = new Map(gastos.map((g) => [g.userId, g]));
  const nomeAparelho = new Map(aparelhos.map((a) => [a.id, a.nome]));
  const projetistas = users
    .filter((u) => modulos.some((m) => m.userId === u.id) || teto.has(u.id))
    .map((u) => ({ id: u.id, nome: u.name || u.email, ativo: u.ativo, tetoMensalBrl: teto.get(u.id) ?? null,
      gastoMesBrl: Number(gasto.get(u.id)?._sum?.custoBrl) || 0, chamadasMes: gasto.get(u.id)?._count?._all || 0 }))
    .sort((a, b) => b.gastoMesBrl - a.gastoMesBrl || a.nome.localeCompare(b.nome));
  return NextResponse.json({
    aparelhos: aparelhos.map((a) => ({ ...a, usuario: nome.get(a.userId) || null })),
    projetistas,
    usos: usos.map((u) => ({ ...u, usuario: nome.get(u.userId) || null, aparelho: nomeAparelho.get(u.aparelhoId) || null })),
  }, { headers: { "cache-control": "no-store" } });
}
