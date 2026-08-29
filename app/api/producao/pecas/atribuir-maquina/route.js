// POST /api/producao/pecas/atribuir-maquina
// Define a máquina (laser) de várias peças de uma vez — sem liberar/mudar status.
// Body: { ids: string[], maquina: "LASER_CHAPA"|... |null }
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SO_FABRICACAO } from "@/lib/lista-pecas";
import { requireRole } from "@/lib/session";
import { z } from "zod";

const MAQUINAS_VALIDAS = ["LASER_CHAPA", "LASER_PERFIL", "LASER_TUBO", "LASER_CANTONEIRA", "CORTE_MANUAL"];

const schema = z.object({
  ids: z.array(z.string()).min(1, "Selecione ao menos uma peça"),
  maquina: z.enum(MAQUINAS_VALIDAS).nullable(),
});

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  // ⚠⚠ A LE NÃO SE PROGRAMA. Vitor (29/08/2026): "nunca programar nada que for por parte da LE,
  // produção é regra sempre LPC". A lista de expedição descreve o que EMBARCA (inclui acessório
  // comprado); a de fabricação é a LPC. Sem esta trava, 223 marcas de expedição já tinham recebido
  // máquina de corte e prioridade — LASER_CANTONEIRA em marca que ninguém vai cortar.
  //
  // ⚠ O filtro fica no WHERE, não numa validação antes: assim vale para a seleção mista (parte LPC,
  // parte LE) — a LPC é programada, a LE é recusada, e a resposta diz quantas ficaram de fora.
  const r = await prisma.pecaConjunto.updateMany({
    where: { id: { in: body.ids }, ...SO_FABRICACAO },
    data: { maquina: body.maquina },
  });
  const recusadas = body.ids.length - r.count;

  try {
    await prisma.auditLog.create({
      data: {
        userId: user.id, action: "ATRIBUIR_MAQUINA_LOTE", entity: "PecaConjunto",
        entityId: body.ids.length === 1 ? body.ids[0] : `${body.ids.length} peças`,
        diff: { maquina: body.maquina, total: body.ids.length, atualizados: r.count, recusadasNaoLpc: recusadas },
      },
    });
  } catch {}

  return NextResponse.json({
    ok: true, atualizados: r.count, maquina: body.maquina,
    ...(recusadas > 0 ? {
      recusadas,
      aviso: `${recusadas} peça(s) não são da LPC e não entram em programação de produção — a lista de expedição (LE) não se corta.`,
    } : {}),
  });
}
