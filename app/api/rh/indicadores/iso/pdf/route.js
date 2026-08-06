// GET /api/rh/indicadores/iso/pdf?ano= — PDF de acompanhamento dos indicadores ISO de RH
// e Segurança do Trabalho (padrão Torg), com a série mensal + acumulado do ano.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { indicadoresRhIso } from "@/lib/indicadores-rh-iso";
import { gerarIndicadoresIsoPDF } from "@/lib/indicadores-iso-pdf";

export const runtime = "nodejs";

export async function GET(req) {
  try { await requireRole(["ADMIN", "RH"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const hoje = new Date();
  const ano = parseInt(new URL(req.url).searchParams.get("ano") || "", 10) || hoje.getUTCFullYear();
  const mesFim = ano < hoje.getUTCFullYear() ? 11 : hoje.getUTCMonth();
  const { indicadores } = await indicadoresRhIso(prisma, ano);
  const bytes = await gerarIndicadoresIsoPDF({ titulo: "Indicadores de RH e Segurança do Trabalho (ISO)", ano, indicadores, mesFim });
  return new NextResponse(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="indicadores-rh-${ano}.pdf"` },
  });
}
