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

  // ⚠⚠ O NÚMERO DA LQC É O NÚMERO DO ORÇAMENTO. Descoberto ao ler as 93 LQCs do SharePoint
  // (29/08/2026): elas se chamam `LQC-283-26-BERMER-AENA-TORG-R00` — 283-26 é o orçamento. O
  // portal vinha gerando uma sequência própria (LQC-001, 002, 003, 004) que não correspondia a
  // orçamento nenhum, então a mesma proposta tinha dois números diferentes: um no Excel do
  // Comercial e outro aqui. Amarrado ao orçamento, o número passa a ser o mesmo dos dois lados.
  //
  // ⚠ Sem orçamento vinculado ainda existe sequencial — proposta pode nascer antes do cadastro —
  // mas ele começa DEPOIS do maior número do ano, para não colidir com um orçamento futuro.
  let numero = null;
  if (b.orcamentoId) {
    const orc = await prisma.orcamento.findUnique({ where: { id: b.orcamentoId }, select: { numero: true } });
    const n = Number(String(orc?.numero || "").split("-")[0]);
    if (Number.isFinite(n) && n > 0) numero = n;
  }
  if (!numero) {
    const ultimo = await prisma.estudoFabricacao.findFirst({ where: { ano }, orderBy: { numero: "desc" }, select: { numero: true } });
    numero = (ultimo?.numero || 0) + 1;
  }

  const estudo = await prisma.estudoFabricacao.create({
    data: {
      ano, numero, cliente,
      obra: String(b.obra || "").trim() || null,
      orcamentoId: b.orcamentoId || null,
      metodo: b.metodo || "ESTIMATIVA",
      criadoPorId: user.id, criadoPorNome: user.name || null,
    },
  });
  return NextResponse.json({ ok: true, estudo });
}
