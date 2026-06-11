// GET /api/rm/proximo-numero?tipo=INTERNA|ALUGUEL — preview do próximo número sequencial.
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { proximoNumeroInterno, proximoNumeroAluguel, proximoNumeroMontagem } from "@/lib/rm-numero";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const tipo = new URL(req.url).searchParams.get("tipo") || "INTERNA";
    const numero = tipo === "ALUGUEL"
      ? await proximoNumeroAluguel()
      : tipo === "MONTAGEM"
      ? await proximoNumeroMontagem()
      : await proximoNumeroInterno();
    return NextResponse.json({ numero });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "erro" }, { status: 500 });
  }
}
