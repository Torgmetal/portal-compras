// GET /api/engenharia/listas/ops — OPs pra o seletor da importação de listas.
// Lê as pastas REAIS de OP no SharePoint (drive SERVIDOR, ao vivo) — assim uma
// pasta nova criada lá aparece automaticamente ao recarregar, e a OP escolhida
// SEMPRE tem pasta pro arquivo cair. numero = extraído do nome ("OP-084 …" → 084);
// nome = a pasta inteira (com a obra) pra exibir.
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { listarPastasOp } from "@/lib/sharepoint-lpc";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  try { await requireRole(["ADMIN", "ENGENHARIA", "PCP", "PLANEJAMENTO", "PRODUCAO"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  try {
    const { ops } = await listarPastasOp();
    return NextResponse.json({
      ops: ops.map((o) => ({ numero: o.opNumero || o.pasta, nome: o.pasta })),
    });
  } catch (e) {
    // Best-effort: se o SharePoint falhar, o seletor fica vazio e a pessoa usa
    // "detectar automaticamente" (o import detecta a OP e a pasta é resolvida no save).
    return NextResponse.json({ ops: [], erro: e.message || "Falha ao listar as pastas do servidor." }, { status: 200 });
  }
}
