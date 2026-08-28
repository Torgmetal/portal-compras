// GET /api/pcp/indicadores/iso/pdf?ano= — PDF de acompanhamento do indicador ISO do PCP
// (padrão Torg), com a série mensal + acumulado do ano.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { indicadoresPcpIso } from "@/lib/indicadores-pcp-iso";
import { gerarIndicadoresIsoPDF } from "@/lib/indicadores-iso-pdf";
import { dispArquivo } from "@/lib/arquivo-http";

export const runtime = "nodejs";

export async function GET(req) {
  try { await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const hoje = new Date();
  const ano = parseInt(new URL(req.url).searchParams.get("ano") || "", 10) || hoje.getUTCFullYear();
  const mesFim = ano < hoje.getUTCFullYear() ? 11 : hoje.getUTCMonth();
  const { indicadores } = await indicadoresPcpIso(prisma, ano);
  const bytes = await gerarIndicadoresIsoPDF({ titulo: "Indicadores do PCP (ISO)", ano, indicadores, mesFim });
  return new NextResponse(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": dispArquivo(`indicadores-pcp-${ano}.pdf`, "inline") },
  });
}
