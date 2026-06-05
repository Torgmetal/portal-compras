import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { classificarMaquina } from "@/lib/maquina-corte";

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ error: e.message }, { status });
  }

  try {
    let opNumero = null;
    try {
      const body = await req.json();
      opNumero = body.opNumero || null;
    } catch {}

    const where = { tipoPeca: { in: ["CROQUI"] } };
    if (opNumero) where.opNumero = opNumero;

    const pecas = await prisma.pecaConjunto.findMany({
      where,
      select: { id: true, descricao: true, pesoUnitKg: true, comprimentoMm: true, maquina: true },
    });

    let atualizados = 0;
    for (const p of pecas) {
      const maq = classificarMaquina(p.descricao, p.pesoUnitKg, p.comprimentoMm);
      if (maq && maq !== p.maquina) {
        await prisma.pecaConjunto.update({
          where: { id: p.id },
          data: { maquina: maq },
        });
        atualizados++;
      }
    }

    // Avulsas (tipoPeca null, mas tem material)
    const avulsas = await prisma.pecaConjunto.findMany({
      where: { tipoPeca: null, material: { not: undefined }, ...(opNumero ? { opNumero } : {}) },
      select: { id: true, descricao: true, pesoUnitKg: true, comprimentoMm: true, maquina: true },
    });
    for (const p of avulsas) {
      const maq = classificarMaquina(p.descricao, p.pesoUnitKg, p.comprimentoMm);
      if (maq && maq !== p.maquina) {
        await prisma.pecaConjunto.update({
          where: { id: p.id },
          data: { maquina: maq },
        });
        atualizados++;
      }
    }

    try {
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: "RECLASSIFICAR_MAQUINAS",
          entity: "PecaConjunto",
          entityId: opNumero || "TODAS",
          diff: { opNumero, totalAnalisadas: pecas.length + avulsas.length, atualizados },
        },
      });
    } catch {}

    return NextResponse.json({ ok: true, analisadas: pecas.length + avulsas.length, atualizados });
  } catch (e) {
    console.error("[reclassificar-maquinas] erro:", e?.message);
    return NextResponse.json({ error: e?.message || "Erro interno" }, { status: 500 });
  }
}
