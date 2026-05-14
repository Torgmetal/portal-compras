// POST — ajuste manual de alocacao de uma SAIDA do estoque entre OPs.
// Substitui as alocacoes existentes pelas passadas (que somam a qtd total).
// Reverte qtdConsumida das reservas antigas e abate nas novas.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { reajustarAlocacaoManual } from "@/lib/estoque-alocacao";

const schema = z.object({
  alocacoes: z.array(z.object({
    opId: z.string().min(1),
    quantidade: z.number().min(0),
  })).min(1),
});

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN"]);  // pendurar so admin por enquanto
  } catch {
    return NextResponse.json({ error: "Apenas ADMIN pode ajustar alocacoes." }, { status: 403 });
  }
  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados invalidos: " + e.message }, { status: 400 });
  }

  const res = await reajustarAlocacaoManual({
    movimentacaoId: params.id,
    alocacoesNovas: body.alocacoes,
    userId: user.id,
  });
  if (res.error) return NextResponse.json({ error: res.error }, { status: 400 });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "ajustar_alocacao_estoque",
      entity: "EstoqueMovimentacao",
      entityId: params.id,
      diff: { alocacoes: body.alocacoes },
    },
  });

  return NextResponse.json({ ok: true });
}
