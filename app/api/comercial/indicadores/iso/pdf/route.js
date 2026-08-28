// GET /api/comercial/indicadores/iso/pdf?ano= — PDF de acompanhamento dos indicadores ISO do
// Comercial (padrão Torg), série mensal + acumulado, com os números da planilha RELATÓRIO_PROPOSTAS.
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { indicadoresComercialIso } from "@/lib/indicadores-comercial-iso";
import { gerarIndicadoresIsoPDF } from "@/lib/indicadores-iso-pdf";
import { dispArquivo } from "@/lib/arquivo-http";

export const runtime = "nodejs";

export async function GET(req) {
  try { await requireRole(["ADMIN", "COMERCIAL"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const hoje = new Date();
  const ano = parseInt(new URL(req.url).searchParams.get("ano") || "", 10) || hoje.getUTCFullYear();
  const mesFim = ano < hoje.getUTCFullYear() ? 11 : hoje.getUTCMonth();
  const { indicadores } = await indicadoresComercialIso(ano);
  const bytes = await gerarIndicadoresIsoPDF({ titulo: "Indicadores do Comercial (ISO)", ano, indicadores, mesFim });
  return new NextResponse(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": dispArquivo(`indicadores-comercial-${ano}.pdf`, "inline") },
  });
}
