// GET — PDF da ata de reunião da OP (abre inline no navegador).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { gerarAtaOPPDF } from "@/lib/ata-op-pdf";

export const runtime = "nodejs";
export const maxDuration = 60;
const ROLES = ["ADMIN", "COMERCIAL", "PLANEJAMENTO", "PCP"];

export async function GET(_req, { params }) {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const ata = await prisma.ataOP.findFirst({
    where: { id: params.ataId, opId: params.id },
    include: { op: { select: { numero: true, obra: true, cliente: true, refCliente: true } } },
  });
  if (!ata) return NextResponse.json({ error: "Ata não encontrada" }, { status: 404 });

  let out;
  try { out = await gerarAtaOPPDF(ata); }
  catch (e) { return NextResponse.json({ error: "Falha ao gerar o PDF: " + (e?.message || "erro") }, { status: 500 }); }

  return new Response(out.bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${out.filename.replace(/["\r\n]/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
