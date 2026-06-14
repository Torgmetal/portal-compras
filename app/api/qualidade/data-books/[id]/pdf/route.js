// GET /api/qualidade/data-books/[id]/pdf[?inline=1]
// Gera e transmite o PDF do Data Book (capa + lista mestra + seções + merge dos
// certificados). Só ADMIN/QUALIDADE.
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { gerarDataBookPDF } from "@/lib/databook-pdf";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req, { params }) {
  try {
    await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let out;
  try {
    out = await gerarDataBookPDF(params.id);
  } catch (e) {
    return NextResponse.json({ error: "Falha ao gerar o PDF: " + e.message }, { status: 500 });
  }

  const inline = new URL(req.url).searchParams.get("inline") === "1";
  const nome = out.filename.replace(/["\r\n]/g, "");
  const headers = new Headers();
  headers.set("Content-Type", "application/pdf");
  headers.set("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${nome}"`);
  headers.set("Cache-Control", "private, no-store");
  return new Response(Buffer.from(out.bytes), { status: 200, headers });
}
