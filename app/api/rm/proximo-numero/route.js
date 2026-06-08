// GET /api/rm/proximo-numero — preview do próximo número sequencial de RM Interna.
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { proximoNumeroInterno } from "@/lib/rm-numero";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const numero = await proximoNumeroInterno();
    return NextResponse.json({ numero });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "erro" }, { status: 500 });
  }
}
