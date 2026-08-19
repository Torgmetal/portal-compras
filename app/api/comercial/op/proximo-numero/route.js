// PRÓXIMO NÚMERO DE OP — Vitor (19/08): "o número da OP deve ser preenchido automático".
//
// O número é TEXTO e convive em formatos diferentes ("115", "084", "036-01"), então o próximo sai
// do maior valor NUMÉRICO, não da ordenação alfabética (que poria "84" depois de "115").
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try { await requireRole(["ADMIN", "COMERCIAL", "PLANEJAMENTO"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const ops = await prisma.oP.findMany({ select: { numero: true } });
  const maior = ops.reduce((m, o) => {
    const n = parseInt(String(o.numero || "").match(/(\d+)/)?.[1] ?? "0", 10);
    return n > m ? n : m;
  }, 0);
  const proximo = String(maior + 1).padStart(3, "0");
  // devolve também se já existe, pra tela avisar em vez de deixar o POST falhar no unique
  const jaExiste = ops.some((o) => o.numero === proximo);
  return NextResponse.json({ proximo, maior, jaExiste });
}
