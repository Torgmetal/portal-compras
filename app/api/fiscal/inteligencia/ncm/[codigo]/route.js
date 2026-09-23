import { NextResponse } from "next/server";
import { requireAcesso } from "@/lib/session";
import { detalharNcm } from "@/lib/fiscal/consulta";

// O detalhe de um NCM: a alíquota GERAL e cada Ex, lado a lado.
// ⚠⚠ A rota NUNCA escolhe entre a geral e um Ex — com o código sozinho não há como, e escolher em
// silêncio é o contrato 2 sendo quebrado (ver o bloco fiscal do schema.prisma).
export async function GET(_req, { params }) {
  try {
    await requireAcesso({ modulos: ["FISCAL", "FINANCEIRO"] });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }
  const r = await detalharNcm(params.codigo);
  if (r.erro) return NextResponse.json({ success: false, ...r }, { status: 404 });
  return NextResponse.json({ success: true, ...r });
}
