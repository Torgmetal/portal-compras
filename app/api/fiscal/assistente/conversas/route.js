import { NextResponse } from "next/server";
import { requireAcesso } from "@/lib/session";
import { listarConversas } from "@/lib/fiscal/assistente/conversas";
import { consumoDoDia } from "@/lib/fiscal/assistente/orcamento";
import { configurado, MODELO } from "@/lib/fiscal/assistente/provedor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// As conversas de QUEM PERGUNTA — e quanto ela já gastou hoje.
// ⚠ O consumo vem junto de propósito: teto que só aparece quando estoura é teto que surpreende.
export async function GET() {
  let user;
  try {
    user = await requireAcesso({ modulos: ["FISCAL", "FINANCEIRO"] });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }
  const [conversas, consumo] = await Promise.all([listarConversas(user.id), consumoDoDia(user.id)]);
  return NextResponse.json({ success: true, conversas, consumo, disponivel: configurado(), modelo: MODELO });
}
