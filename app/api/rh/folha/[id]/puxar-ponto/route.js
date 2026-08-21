// POST /api/rh/folha/[id]/puxar-ponto — (re)preenche HE por %, faltas e atrasos de
// cada item a partir do Controle de Ponto da mesma competência. RH ajusta depois.
// Bloqueia se FECHADA. Só ADMIN/RH.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { mapaPontoCompetencia } from "@/lib/folha-ponto";
import { resumo } from "@/lib/folha-calc";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "RH"]); } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const folha = await prisma.folhaCompetencia.findUnique({
    where: { id: params.id },
    select: { id: true, competencia: true, status: true },
  });
  if (!folha) return NextResponse.json({ success: false, error: "Competência não encontrada" }, { status: 404 });
  if (folha.status === "FECHADA") return NextResponse.json({ success: false, error: "Competência fechada — reabra para atualizar" }, { status: 409 });

  const mapa = await mapaPontoCompetencia(folha.competencia);
  if (mapa.size === 0) return NextResponse.json({ success: false, error: `Sem Controle de Ponto lançado para ${folha.competencia}. Feche o ponto dessa competência primeiro.` }, { status: 400 });

  const itens = await prisma.folhaItem.findMany({ where: { folhaId: folha.id }, select: { id: true, funcionarioId: true } });
  let atualizados = 0;
  await prisma.$transaction(
    itens.filter((it) => it.funcionarioId && mapa.has(it.funcionarioId)).map((it) => {
      const pt = mapa.get(it.funcionarioId);
      atualizados++;
      return prisma.folhaItem.update({ where: { id: it.id }, data: {
        heHoras50: pt.heHoras50, heHoras60: pt.heHoras60, heHoras80: pt.heHoras80,
        heHoras100: pt.heHoras100, heHoras150: pt.heHoras150,
        faltasHoras: pt.faltasHoras, atrasosHoras: pt.atrasosHoras,
      } });
    })
  );

  await prisma.auditLog.create({ data: { userId: user.id, action: "FOLHA_PUXAR_PONTO", entity: "FolhaCompetencia", entityId: folha.id, diff: { competencia: folha.competencia, atualizados } } }).catch(() => {});

  const todos = await prisma.folhaItem.findMany({ where: { folhaId: folha.id } });
  return NextResponse.json({ success: true, atualizados, resumo: resumo(todos) });
}
