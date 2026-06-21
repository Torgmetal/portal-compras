// GET /api/diretoria/previsao-faturamento — linha do tempo de faturamento previsto.
// Pega o saldo a faturar líquido de cada OP ativa e o DATA: a data de faturamento
// vem da entrega (cronograma vigente › prazo da OP) e a de recebimento soma o prazo
// de pagamento do cliente (do kickoff). Cruza com o progresso de produção pra
// sinalizar o que dá pra antecipar. Gate próprio (requireDiretoria).
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireDiretoria } from "@/lib/diretoria";
import { calcularPrevisaoFaturamento } from "@/lib/previsao-faturamento";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  try {
    await requireDiretoria();
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const hojeIso = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const hoje = new Date(hojeIso + "T00:00:00.000Z");
  const p = await calcularPrevisaoFaturamento(hoje);

  return NextResponse.json({
    totalSaldo: p.totalSaldo, totalAtrasado: p.totalAtrasado, qtd: p.ops.length, qtdAntecipavel: p.qtdAntecipavel,
    faturamentoMes: p.faturamentoMes, recebimentoMes: p.recebimentoMes,
    ops: p.ops,
  });
}

// POST — define/atualiza a data de faturamento manual de uma OP (override).
const bodySchema = z.object({
  opId: z.string().min(1),
  dataFaturamento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (use AAAA-MM-DD)"),
  observacao: z.string().max(500).optional().nullable(),
});

export async function POST(req) {
  let user;
  try { user = await requireDiretoria(); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let body;
  try { body = bodySchema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const data = new Date(body.dataFaturamento + "T00:00:00.000Z");
  if (isNaN(data.getTime())) return NextResponse.json({ error: "Data inválida" }, { status: 400 });

  const op = await prisma.oP.findUnique({ where: { id: body.opId }, select: { id: true, numero: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });

  const saved = await prisma.diretoriaFaturamentoData.upsert({
    where: { opId: body.opId },
    create: { opId: body.opId, dataFaturamento: data, observacao: body.observacao || null, atualizadoPor: user.email },
    update: { dataFaturamento: data, observacao: body.observacao || null, atualizadoPor: user.email },
  });
  await prisma.auditLog.create({ data: { userId: user.id, action: "DIRETORIA_DATA_FATURAMENTO", entity: "OP", entityId: op.numero, diff: { dataFaturamento: body.dataFaturamento, observacao: body.observacao || null } } }).catch(() => {});
  return NextResponse.json({ ok: true, dataFaturamento: saved.dataFaturamento });
}

// DELETE — remove o override e volta a data ao automático (cronograma › prazo OP).
export async function DELETE(req) {
  let user;
  try { user = await requireDiretoria(); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const opId = new URL(req.url).searchParams.get("opId");
  if (!opId) return NextResponse.json({ error: "opId obrigatório" }, { status: 400 });

  await prisma.diretoriaFaturamentoData.deleteMany({ where: { opId } });
  await prisma.auditLog.create({ data: { userId: user.id, action: "DIRETORIA_DATA_FATURAMENTO_LIMPAR", entity: "OP", entityId: opId } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
