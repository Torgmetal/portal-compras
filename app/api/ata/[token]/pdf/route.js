// GET /api/ata/[token]/pdf — ata em PDF pelo link público (sem login).
// Exige o recebimento confirmado, igual ao conteúdo da página.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { gerarAtaPDF } from "@/lib/ata-pdf";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_req, { params }) {
  const conf = await prisma.ataConfirmacao.findUnique({ where: { token: params.token } });
  if (!conf) return NextResponse.json({ success: false, error: "Link inválido ou expirado." }, { status: 404 });
  if (!conf.confirmadoEm) return NextResponse.json({ success: false, error: "Confirme o recebimento para baixar a ata." }, { status: 403 });

  const ata = await prisma.ataReuniao.findUnique({
    where: { id: conf.ataId },
    include: { atividades: { orderBy: { ordem: "asc" } }, confirmacoes: true },
  });
  if (!ata) return NextResponse.json({ success: false, error: "Ata não encontrada" }, { status: 404 });

  let out;
  try { out = await gerarAtaPDF(ata); }
  catch (e) { return NextResponse.json({ success: false, error: "Falha ao gerar o PDF: " + (e?.message || "erro") }, { status: 500 }); }

  return new Response(Buffer.from(out.bytes), {
    status: 200,
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${out.filename}"` },
  });
}
