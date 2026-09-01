// POST /api/pcp/solda → a bancada sugerida para o conjunto na solda
//   { ids, bancada: "SOLDA 4" }  → registra a intenção
//   { ids, bancada: null }        → tira a sugestão
//
// ⚠⚠ ISTO É INTENÇÃO, NÃO ORDEM. Vitor (01/09/2026) escolheu "só registra a intenção": quem manda
// na bancada é o líder no chão. O portal organiza a fila e anota a sugestão; o que de fato
// aconteceu volta do Syneco. Não medir aderência contra este campo — ele não é promessa de ninguém,
// e transformá-lo em cobrança seria trocar a regra sem avisar a fábrica.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const ROLES = ["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"];

const schema = z.object({
  ids: z.array(z.string()).min(1, "Selecione ao menos um conjunto"),
  bancada: z.string().trim().max(60).nullable(),
});

export async function POST(req) {
  let user;
  try { user = await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const bancada = body.bancada || null;
  const r = await prisma.pecaConjunto.updateMany({
    where: { id: { in: body.ids }, tipoPeca: "CONJUNTO" },
    data: {
      soldaBancada: bancada,
      soldaBancadaEm: bancada ? new Date() : null,
      soldaBancadaPor: bancada ? (user.name || null) : null,
    },
  });

  try {
    await prisma.auditLog.create({
      data: { userId: user.id, action: "SOLDA_BANCADA", entity: "PecaConjunto",
              entityId: body.ids.length === 1 ? body.ids[0] : `${body.ids.length} conjuntos`,
              diff: { bancada, total: body.ids.length, atualizados: r.count } },
    });
  } catch {}

  return NextResponse.json({ ok: true, atualizados: r.count, bancada });
}
