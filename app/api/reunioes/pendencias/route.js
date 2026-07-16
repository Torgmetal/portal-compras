// GET /api/reunioes/pendencias — tarefas EM ABERTO (atrasadas + em andamento)
// da última ata enviada. Servem de ponto de partida da ata da semana seguinte:
// o que não foi concluído volta pra acompanhamento.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { EM_ABERTO } from "@/lib/ata-status";

export const runtime = "nodejs";

export async function GET() {
  try { await requireRole(["ADMIN", "PLANEJAMENTO"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const ultima = await prisma.ataReuniao.findFirst({
    where: { status: { not: "RASCUNHO" } },
    orderBy: [{ ano: "desc" }, { numero: "desc" }],
    include: { atividades: { where: { status: { in: EM_ABERTO } }, orderBy: { ordem: "asc" } } },
  });
  if (!ultima) return NextResponse.json({ ata: null, atividades: [] });

  return NextResponse.json({
    ata: { id: ultima.id, numero: ultima.numero, semanaIso: ultima.semanaIso, ano: ultima.ano, titulo: ultima.titulo },
    // é a mesma reunião semanal — serve de ponto de partida pra não redigitar
    envolvidos: Array.isArray(ultima.envolvidos) ? ultima.envolvidos : [],
    atividades: ultima.atividades.map((a) => ({
      op: a.op,
      descricao: a.descricao,
      setor: a.setor,
      responsavel: a.responsavel,
      prazo: a.prazo,
      status: a.status,
      // mantém a ata de ORIGEM mais antiga, pra dar pra ver há quantas semanas arrasta
      origemAtaNumero: a.origemAtaNumero ?? ultima.numero,
    })),
  });
}
