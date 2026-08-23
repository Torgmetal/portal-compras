// Consulta o frete na QualP para preencher a aba de frete do estudo.
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { consultarFrete } from "@/lib/qualp";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req) {
  try { await requireRole(["ADMIN", "COMERCIAL"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const b = await req.json().catch(() => ({}));
  const r = await consultarFrete({
    origem: String(b.origem || "").trim(),
    destino: String(b.destino || "").trim(),
    eixos: b.eixos, tipoVeiculo: b.tipoVeiculo, cargaKg: Number(b.cargaKg) || 0,
  });
  // ⚠ falta de chave não é erro de servidor: é configuração pendente, e a tela precisa dizer isso
  if (!r.ok) return NextResponse.json(r, { status: r.semChave ? 200 : 502 });
  return NextResponse.json(r);
}
