// POST /api/qualidade/inspecoes/[id]/revisao — abre a revisão seguinte de um relatório já enviado
// para assinatura: congela a rodada assinada, sobe R e destrava a edição (ver lib/relatorio-revisao).
//
// Vitor (11/09/2026): "poderia voltar as assinaturas desse relatório e permitir que eu consiga
// editar as peças informadas". Voltar assinatura não é apagar: a rodada fica no histórico e no
// data book; o que muda é que o relatório volta a ser rascunho, numa revisão nova.
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/session";
import { abrirRevisaoRelatorio } from "@/lib/relatorio-revisao";

export const runtime = "nodejs";
const schema = z.object({ motivo: z.string().min(5, "Diga o que vai ser revisto (mínimo 5 letras).").max(1000) });

export async function POST(req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }
  const { id } = await params;
  try {
    const r = await abrirRevisaoRelatorio(id, { motivo: body.motivo, porQuem: user.name || user.email, porQuemId: user.id, origem: "PORTAL" });
    return NextResponse.json({ ok: true, relatorio: r.relatorio, revisaoFechada: r.snapshot.revisao, assinaturasCongeladas: r.snapshot.assinaturas.filter((a) => a.assinadoEm).length });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: /não encontrado/i.test(e.message) ? 404 : 409 });
  }
}
