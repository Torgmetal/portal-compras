// GET — PÚBLICO (por token): PDF da ata, pro cliente baixar da página de aceite.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { gerarAtaOPPDF } from "@/lib/ata-op-pdf";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_req, { params }) {
  const ata = await prisma.ataOP.findUnique({
    where: { tokenCliente: params.token },
    include: { op: { select: { numero: true, obra: true, cliente: true, refCliente: true } } },
  });
  if (!ata) return NextResponse.json({ error: "Link inválido ou expirado." }, { status: 404 });

  let out;
  try { out = await gerarAtaOPPDF(ata); }
  catch { return NextResponse.json({ error: "Falha ao gerar o PDF." }, { status: 500 }); }

  return new Response(out.bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${out.filename.replace(/["\r\n]/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
