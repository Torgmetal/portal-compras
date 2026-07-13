// GET /api/rh/ponto/[id]/arquivo — cartão de ponto (PDF) de um funcionário para
// o RH visualizar (mesma página que o funcionário vê no /colaborador). O PDF
// completo fica no Blob; extraímos só a PÁGINA do item (pdf-lib). ?download=1.
// Só ADMIN/RH.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { assertBlobUrlSegura } from "@/lib/blob-url";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req, { params }) {
  try {
    await requireRole(["ADMIN", "RH"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const item = await prisma.pontoItem.findUnique({
    where: { id: params.id },
    select: { pdfUrl: true, pagina: true, nome: true, ponto: { select: { competencia: true } } },
  });
  if (!item || !item.pdfUrl) {
    return NextResponse.json({ error: "Cartão não encontrado" }, { status: 404 });
  }

  try { assertBlobUrlSegura(item.pdfUrl); }
  catch { return NextResponse.json({ error: "Arquivo inválido" }, { status: 400 }); }

  const res = await fetch(item.pdfUrl);
  if (!res.ok) return NextResponse.json({ error: "Falha ao buscar arquivo" }, { status: 502 });
  const full = Buffer.from(await res.arrayBuffer());

  let bytes;
  try {
    const { PDFDocument } = await import("pdf-lib");
    const src = await PDFDocument.load(full);
    const out = await PDFDocument.create();
    const idx = Math.min(Math.max((item.pagina || 1) - 1, 0), src.getPageCount() - 1);
    const [pg] = await out.copyPages(src, [idx]);
    out.addPage(pg);
    bytes = await out.save();
  } catch {
    bytes = full; // fallback: PDF inteiro
  }

  const baixar = new URL(req.url).searchParams.get("download") === "1";
  const nome = `cartao-ponto-${item.ponto?.competencia || "mes"}.pdf`;
  const headers = new Headers();
  headers.set("Content-Type", "application/pdf");
  headers.set("Content-Disposition", `${baixar ? "attachment" : "inline"}; filename="${nome}"`);
  headers.set("Cache-Control", "private, no-store");
  return new Response(bytes, { status: 200, headers });
}
