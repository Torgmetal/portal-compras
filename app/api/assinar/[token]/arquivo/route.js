// O ARQUIVO do documento a aceitar (Excel), pelo mesmo token da assinatura.
//
// Vitor (26/08/2026) sobre o PLP e o PIT: "deixar ele no formato excel para ficar mais sério,
// preservar os campos de assinatura". O PDF da página é para LER; este é o documento.
//
// ⚠ SAI DO SNAPSHOT DO ENVIO, não do cadastro de hoje — quem abrir o link amanhã tem de baixar
// exatamente o que recebeu para aceitar.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { excelDoPlano } from "@/lib/planos-aceite";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_req, { params }) {
  const { token } = await params;
  const a = await prisma.assinaturaDocumento.findUnique({
    where: { token },
    select: { envio: { select: { tipo: true, opNumero: true, snapshot: true } } },
  });
  if (!a) return new NextResponse("Link inválido.", { status: 404 });
  const { tipo, opNumero, snapshot } = a.envio;
  if (tipo !== "PLP" && tipo !== "PIT") return new NextResponse("Este documento não tem arquivo.", { status: 400 });

  const arq = await excelDoPlano(prisma, tipo, opNumero || snapshot?.opNumero, { snapshot }).catch(() => null);
  if (!arq) return new NextResponse("Não consegui montar o arquivo deste documento.", { status: 502 });

  return new NextResponse(Buffer.from(arq.bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${arq.nome}"`,
      "Cache-Control": "no-store",
    },
  });
}
