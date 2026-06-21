// GET/POST /api/diretoria/config — config chave-valor do módulo Diretoria.
// Hoje guarda o "saldoCaixa" (saldo de caixa atual), ponto de partida do fluxo
// de caixa diário. Gate próprio (requireDiretoria).
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireDiretoria } from "@/lib/diretoria";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireDiretoria();
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }
  const saldo = await prisma.diretoriaConfig.findUnique({ where: { id: "saldoCaixa" } });
  return NextResponse.json({ saldoCaixa: saldo?.valor ?? 0, atualizadoEm: saldo?.atualizadoEm || null, atualizadoPor: saldo?.atualizadoPor || null });
}

const bodySchema = z.object({
  saldoCaixa: z.number().finite(),
  observacao: z.string().max(300).optional().nullable(),
});

export async function POST(req) {
  let user;
  try { user = await requireDiretoria(); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let body;
  try { body = bodySchema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const valor = Math.round(body.saldoCaixa * 100) / 100;
  const antes = await prisma.diretoriaConfig.findUnique({ where: { id: "saldoCaixa" } });
  await prisma.diretoriaConfig.upsert({
    where: { id: "saldoCaixa" },
    create: { id: "saldoCaixa", valor, observacao: body.observacao || null, atualizadoPor: user.email },
    update: { valor, observacao: body.observacao || null, atualizadoPor: user.email },
  });
  await prisma.auditLog.create({ data: { userId: user.id, action: "DIRETORIA_SALDO_CAIXA", entity: "DiretoriaConfig", entityId: "saldoCaixa", diff: { antes: antes?.valor ?? null, depois: valor } } }).catch(() => {});
  return NextResponse.json({ ok: true, saldoCaixa: valor });
}
