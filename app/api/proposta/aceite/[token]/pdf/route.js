// GET /api/proposta/aceite/[token]/pdf — PÚBLICO: PDF da proposta por token,
// para o cliente ver antes de aprovar. Sem login (allowlist no middleware).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { gerarPropostaPDF } from "@/lib/proposta-servico-pdf";
import { dispArquivo } from "@/lib/arquivo-http";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_req, { params }) {
  const o = await prisma.orcamentoServico.findUnique({ where: { aceiteToken: params.token } });
  if (!o) return NextResponse.json({ success: false, error: "Link inválido ou expirado." }, { status: 404 });

  let out;
  try { out = await gerarPropostaPDF(o); }
  catch { return NextResponse.json({ success: false, error: "Falha ao gerar o PDF" }, { status: 500 }); }

  return new Response(Buffer.from(out.bytes), {
    status: 200,
    headers: { "Content-Type": "application/pdf", "Content-Disposition": dispArquivo(`${out.numeroPtc}.pdf`, "inline") },
  });
}
