// GET — baixa um volume do Data Book (interno). Só ADMIN/QUALIDADE.
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { responderVolume } from "@/lib/databook-download";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req, { params }) {
  try { await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const inline = new URL(req.url).searchParams.get("inline") === "1";
  return responderVolume(params.id, params.volume, { inline });
}
