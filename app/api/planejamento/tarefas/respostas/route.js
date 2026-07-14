// GET /api/planejamento/tarefas/respostas — Painel de Respostas: registros de
// todas as respostas (cliente + setor) às tarefas do Planejamento.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export async function GET(req) {
  try { await requireRole(["ADMIN", "PLANEJAMENTO", "PRODUCAO", "COMERCIAL"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { searchParams } = new URL(req.url);
  const origem = searchParams.get("origem"); // CLIENTE | SETOR (opcional)
  const op = (searchParams.get("op") || "").trim();

  const where = {};
  if (origem === "CLIENTE" || origem === "SETOR") where.origem = origem;
  if (op) where.tarefa = { opNumero: op.replace(/^T0*/i, "").padStart(3, "0") };

  const respostas = await prisma.tarefaResposta.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 300,
    select: {
      id: true, origem: true, autorNome: true, tipo: true, novaData: true, texto: true, createdAt: true,
      tarefa: { select: { id: true, titulo: true, opNumero: true, setor: true, status: true } },
    },
  });
  return NextResponse.json({ respostas });
}
