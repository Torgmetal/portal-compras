// POST /api/producao/pecas/liberar-corte
// Libera pecas para corte (muda status PENDENTE → CORTE)
// Body: { ids: string[] } ou { ids: string[], reverter: true } para voltar CORTE → PENDENTE
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

const MAQUINAS_VALIDAS = ["LASER_CHAPA", "LASER_PERFIL", "LASER_TUBO", "LASER_CANTONEIRA"];

const schema = z.object({
  ids: z.array(z.string()).min(1, "Selecione ao menos uma peça"),
  reverter: z.boolean().optional(),
  // Mapa de id → maquina para salvar na liberação
  maquinas: z.record(z.string(), z.enum(MAQUINAS_VALIDAS).nullable()).optional(),
});

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "PRODUCAO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ error: e.message }, { status });
  }

  try {
    let body;
    try {
      body = schema.parse(await req.json());
    } catch (e) {
      return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 });
    }

    const { ids, reverter, maquinas } = body;

    const statusDe = reverter ? "CORTE" : "PENDENTE";
    const statusPara = reverter ? "PENDENTE" : "CORTE";

    let atualizados = 0;

    if (!reverter && maquinas && Object.keys(maquinas).length > 0) {
      // Liberar: atualiza maquina + status peça a peça (pra cada uma ter sua maquina correta)
      for (const id of ids) {
        const maq = maquinas[id] || null;
        const data = { status: statusPara };
        if (maq) data.maquina = maq;
        const r = await prisma.pecaConjunto.updateMany({
          where: { id, status: statusDe },
          data,
        });
        atualizados += r.count;
      }
    } else {
      // Sem maquinas ou reverter: batch update só status
      const result = await prisma.pecaConjunto.updateMany({
        where: { id: { in: ids }, status: statusDe },
        data: { status: statusPara },
      });
      atualizados = result.count;
    }

    try {
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: reverter ? "REVERTER_LIBERACAO_CORTE" : "LIBERAR_CORTE",
          entity: "PecaConjunto",
          entityId: ids.length === 1 ? ids[0] : `${ids.length} pecas`,
          diff: {
            ids: ids.slice(0, 20), // limitar pra não estourar JSON
            total: ids.length,
            de: statusDe,
            para: statusPara,
            atualizados,
            comMaquina: maquinas ? Object.keys(maquinas).length : 0,
          },
        },
      });
    } catch {}

    return NextResponse.json({
      ok: true,
      atualizados,
      acao: reverter ? "REVERTIDO" : "LIBERADO",
    });
  } catch (e) {
    console.error("[liberar-corte] erro:", e?.message);
    return NextResponse.json({ error: e?.message || "Erro interno" }, { status: 500 });
  }
}
