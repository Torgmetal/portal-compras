// GET /api/comercial/op/[id]/analise-critica/pdf — FORM 08 Rev.02 em PDF, a partir do registro.
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { dispArquivo } from "@/lib/arquivo-http";
import { montarForm08 } from "@/lib/analise-critica-emitir";

export const runtime = "nodejs";

export async function GET(_req, { params }) {
  try { await requireUser(); } catch (e) { return NextResponse.json({ error: e.message }, { status: 401 }); }
  const { id } = await params;
  const r = await montarForm08(id);
  if (r.erro) return NextResponse.json({ error: r.erro }, { status: r.status });
  return new NextResponse(Buffer.from(r.bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": dispArquivo(r.filename, "inline") } });
}
