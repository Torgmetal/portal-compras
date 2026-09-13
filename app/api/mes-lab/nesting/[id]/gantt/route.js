// O NESTING DO DIA CONTRA O QUE O PCP LIBEROU NAQUELA MÁQUINA.
//
// GET /api/mes-lab/nesting/<id>/gantt?recurso=LASER_CHAPA[&dia=2026-09-13]
//
// ⚠ SÓ LÊ. A conferência não muda plano nem programação — ela põe as duas listas lado a lado.
// Bloquear o corte porque duas telas discordam faria o operador contornar por fora, e aí ninguém
// mais sabe de nada.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { programadoPara } from "@/lib/mes/programado";
import { conferirComGantt } from "@/lib/mes/nesting/conferir-gantt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const erro = (msg, status = 400) => NextResponse.json({ success: false, error: msg }, { status });

export async function GET(req, { params }) {
  try {
    await requireRole(["ADMIN"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message },
      { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const codigo = searchParams.get("recurso");
  if (!codigo) return erro("Diga em qual máquina este plano vai rodar.");

  const [plano, recurso] = await Promise.all([
    prisma.mesNesting.findUnique({
      where: { id },
      include: { unidades: { include: { itens: true }, orderBy: { indice: "asc" } } },
    }),
    prisma.mesRecurso.findUnique({ where: { codigo }, include: { setor: true } }),
  ]);
  if (!plano) return erro("Plano não encontrado.", 404);
  if (!recurso) return erro("Máquina não encontrada.", 404);

  const dia = searchParams.get("dia") ? new Date(`${searchParams.get("dia")}T12:00:00`) : new Date();
  const programado = await programadoPara(prisma, recurso, dia);
  if (programado.semMapa) return erro(`O setor ${recurso.setor?.codigo} não é programado no Gantt.`);

  return NextResponse.json({
    success: true,
    recurso: { codigo: recurso.codigo, nome: recurso.nome, setor: recurso.setor?.nome },
    // ⚠ Quando o posto não é um código que o Gantt conhece, `programadoPara` cai para o SETOR
    // inteiro (§14.1) — e quem lê a conferência precisa saber disso, senão vai achar que o PCP
    // liberou para esta máquina o que na verdade liberou para o setor.
    doSetor: Boolean(programado.doSetor),
    conferencia: conferirComGantt(plano.unidades, programado.lotes),
  });
}
