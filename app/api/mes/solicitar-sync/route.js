import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

// POST /api/mes/solicitar-sync
// Chamado pelo botão "Sincronizar agora" no portal (usuário autenticado).
// Grava uma solicitação pendente — o agente daemon lê e executa em até 30s.
export async function POST(req) {
  let session;
  try {
    session = await requireRole(["ADMIN", "PRODUCAO", "COMERCIAL", "COMPRAS"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ error: e.message }, { status });
  }

  const request = await prisma.mesSyncRequest.create({
    data: { solicitadoPor: session.id || session.email || null },
  });

  return NextResponse.json({ ok: true, requestId: request.id });
}

// GET /api/mes/solicitar-sync
// Chamado pelo agente daemon a cada 30s para verificar se há sync pendente.
// Auth: Bearer API key (mesma do sync).
// Retorna { pendente: true } se há solicitação não executada, e a marca como executada.
// Retorna { pendente: false } se não há nada.
export async function GET(req) {
  const apiKey = process.env.MES_SYNC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "não configurado" }, { status: 503 });
  const auth = req.headers.get("authorization") || "";
  if (auth.slice(7) !== apiKey) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Busca a solicitação mais antiga ainda não executada
  const pendente = await prisma.mesSyncRequest.findFirst({
    where: { executadoEm: null },
    orderBy: { criadoEm: "asc" },
  });

  if (!pendente) return NextResponse.json({ pendente: false });

  // Marca como executada (atomicamente — mesmo que dois agentes consultem juntos,
  // só o primeiro encontra executadoEm: null)
  await prisma.mesSyncRequest.updateMany({
    where: { executadoEm: null },
    data:  { executadoEm: new Date() },
  });

  return NextResponse.json({ pendente: true, requestId: pendente.id });
}
