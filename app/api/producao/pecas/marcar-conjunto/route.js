// POST /api/producao/pecas/marcar-conjunto
// Marca peças "sem máquina" como CONJUNTO — elas não passam por corte:
// começam o processo na MONTAGEM. Reverter volta para PENDENTE (croqui),
// reentrando no fluxo de corte.
// Body: { ids: string[], reverter?: boolean }
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

const schema = z.object({
  ids: z.array(z.string()).min(1, "Selecione ao menos uma peça"),
  reverter: z.boolean().optional(),
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

  const { ids, reverter } = body;

  let atualizados = 0, ignoradas = [];
  if (reverter) {
    // Volta para a fila de corte como peça cortável (croqui), sem máquina.
    const r = await prisma.pecaConjunto.updateMany({
      where: { id: { in: ids }, status: "MONTAGEM", tipoPeca: "CONJUNTO" },
      data: { status: "PENDENTE", tipoPeca: "CROQUI", maquina: null, ultimoSetor: null },
    });
    atualizados = r.count;
  } else {
    // ⚠⚠ POSIÇÃO DE CONJUNTO NUNCA VIRA CONJUNTO. OP-113 (03/09/2026): logo depois de importar a LPC,
    // o PCP selecionou 82 peças "sem máquina" e marcou todas como conjunto — 30 delas eram CHAPAS
    // (T113A-P3, P13, P27…), posições de T113A1–A120 que a chapa vai cortada na preparação e por
    // isso não têm máquina na lista. Viraram "avulsas na montagem": nenhuma baixa de corte as
    // alcançava mais, e os conjuntos-pai ficaram "não prontos" no portal por onze dias enquanto a
    // fábrica os dava por montáveis. Quem é croqui de alguém é componente: passa pelo corte, e o
    // portal recusa em vez de obedecer — a tela diz quais ficaram de fora e por quê.
    const posicoes = await prisma.pecaConjunto.findMany({
      where: { id: { in: ids }, croquiConjuntos: { some: {} } },
      select: { id: true, marca: true },
    });
    ignoradas = posicoes;
    const idsLivres = ids.filter((id) => !posicoes.some((p) => p.id === id));
    // Só peças ainda em PENDENTE ou CORTE viram conjunto (não mexe em quem já avançou).
    const r = idsLivres.length ? await prisma.pecaConjunto.updateMany({
      where: { id: { in: idsLivres }, status: { in: ["PENDENTE", "CORTE"] } },
      data: {
        tipoPeca: "CONJUNTO",
        maquina: null,
        status: "MONTAGEM",
        ultimoSetor: "Montagem",
        // limpa a programação de corte — a peça não será cortada
        corteDataMetaInicio: null,
        corteDataMetaFim: null,
        corteIniciadoEm: null,
        corteConcluidoEm: null,
        corteOrdem: null,
      },
    }) : { count: 0 };
    atualizados = r.count;
  }

  try {
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: reverter ? "REVERTER_CONJUNTO" : "MARCAR_CONJUNTO",
        entity: "PecaConjunto",
        entityId: ids.length === 1 ? ids[0] : `${ids.length} peças`,
        diff: { ids: ids.slice(0, 30), total: ids.length, atualizados, destino: reverter ? "PENDENTE" : "MONTAGEM", ignoradasCroqui: ignoradas.map((p) => p.marca).slice(0, 30) },
      },
    });
  } catch {}

  return NextResponse.json({
    ok: true, atualizados, destino: reverter ? "PENDENTE" : "MONTAGEM",
    // quem ficou de fora volta NOMEADO: é posição de conjunto e passa pelo corte
    ignoradas: ignoradas.map((p) => ({ id: p.id, marca: p.marca })),
    aviso: ignoradas.length
      ? `${ignoradas.length} peça(s) não viraram conjunto — são posições de conjunto (croqui) e passam pelo corte: ${ignoradas.map((p) => p.marca).slice(0, 8).join(", ")}${ignoradas.length > 8 ? "…" : ""}`
      : null,
  });
}
