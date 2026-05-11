// Atualiza o "totalProposta" de uma cotacao — usado quando o usuario quer
// sobrescrever o total computado pelo sistema (que pode divergir do PDF
// por arredondamento ou erro de parse) com o valor exato da proposta.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const schema = z.object({
  totalProposta: z.number().min(0).nullable(),
});

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Apenas Admin ou Compras." }, { status: 403 });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados inválidos: " + e.message }, { status: 400 });
  }

  const round2 = (n) => (n == null ? null : Math.round(Number(n) * 100) / 100);
  const valor = body.totalProposta != null ? round2(body.totalProposta) : null;

  const cotacao = await prisma.cotacao.findUnique({ where: { id: params.id } });
  if (!cotacao) return NextResponse.json({ error: "Cotação não encontrada." }, { status: 404 });

  await prisma.cotacao.update({
    where: { id: params.id },
    data: { totalProposta: valor },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "set_total_proposta",
      entity: "Cotacao",
      entityId: params.id,
      diff: { de: cotacao.totalProposta, para: valor },
    },
  });

  return NextResponse.json({ ok: true, totalProposta: valor });
}
