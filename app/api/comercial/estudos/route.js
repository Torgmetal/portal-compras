// Estudos de fabricação (a LQC dentro do portal) — lista e criação.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
const PERFIS = ["ADMIN", "COMERCIAL"];

export async function GET(req) {
  try { await requireRole(PERFIS); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const ano = Number(new URL(req.url).searchParams.get("ano")) || undefined;
  const estudos = await prisma.estudoFabricacao.findMany({
    where: ano ? { ano } : undefined,
    orderBy: [{ ano: "desc" }, { numero: "desc" }],
    select: { id: true, numero: true, ano: true, revisao: true, cliente: true, obra: true, status: true,
              resultado: true, criadoPorNome: true, updatedAt: true, orcamentoId: true,
              // o orçamento vem junto: é ele que dá o número da proposta e o valor que foi ao cliente
              orcamento: { select: { numero: true, cliente: true, obra: true, valor: true, status: true } } },
    take: 300,
  });
  return NextResponse.json({ estudos });
}

export async function POST(req) {
  let user;
  try { user = await requireRole(PERFIS); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const b = await req.json().catch(() => ({}));
  const cliente = String(b.cliente || "").trim();
  if (!cliente) return NextResponse.json({ error: "Informe o cliente." }, { status: 400 });

  const ano = Number(b.ano) || new Date().getFullYear();
  // ⚠ o número segue a LQC do Comercial (LQC-nnn-aa): sequencial POR ANO, não global.
  const ultimo = await prisma.estudoFabricacao.findFirst({ where: { ano }, orderBy: { numero: "desc" }, select: { numero: true } });
  const estudo = await prisma.estudoFabricacao.create({
    data: {
      ano, numero: (ultimo?.numero || 0) + 1, cliente,
      obra: String(b.obra || "").trim() || null,
      orcamentoId: b.orcamentoId || null,
      metodo: b.metodo || "ESTIMATIVA",
      criadoPorId: user.id, criadoPorNome: user.name || null,
    },
  });
  return NextResponse.json({ ok: true, estudo });
}
