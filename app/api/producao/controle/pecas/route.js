// POST /api/producao/controle/pecas — adiciona/remove pecas do planejamento diario
// body: { producaoDiariaId, pecaIds: [...], action: "add" | "remove" | "toggle-concluida" }
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    await requireRole(["ADMIN", "PRODUCAO"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }

  const { producaoDiariaId, pecaIds, action, pecaPlanejamentoId } = body;

  if (action === "add" && producaoDiariaId && Array.isArray(pecaIds)) {
    // Verifica se o registro diario existe
    const dia = await prisma.producaoDiaria.findUnique({ where: { id: producaoDiariaId } });
    if (!dia) return NextResponse.json({ error: "Registro diario nao encontrado" }, { status: 404 });

    let criados = 0;
    for (const pecaId of pecaIds) {
      try {
        await prisma.pecaPlanejamento.create({
          data: {
            producaoDiariaId,
            pecaConjuntoId: pecaId,
            qtdPlanejada: 1,
          },
        });
        criados++;
      } catch {
        // Unique constraint — peca ja planejada nesse dia
      }
    }
    return NextResponse.json({ ok: true, criados });
  }

  if (action === "remove" && pecaPlanejamentoId) {
    await prisma.pecaPlanejamento.delete({ where: { id: pecaPlanejamentoId } }).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  if (action === "toggle-concluida" && pecaPlanejamentoId) {
    const pp = await prisma.pecaPlanejamento.findUnique({ where: { id: pecaPlanejamentoId } });
    if (!pp) return NextResponse.json({ error: "Nao encontrado" }, { status: 404 });
    await prisma.pecaPlanejamento.update({
      where: { id: pecaPlanejamentoId },
      data: { concluida: !pp.concluida },
    });
    return NextResponse.json({ ok: true, concluida: !pp.concluida });
  }

  return NextResponse.json({ error: "Acao invalida" }, { status: 400 });
}
