// GET  /api/pcp/baixa-lote?opId=…  → o que falta em cada setor da OP, peça a peça
// POST /api/pcp/baixa-lote {opId, setor, motivo} → baixa TUDO que falta naquele setor, num clique
//
// ⚠ Quem pode: os mesmos do Despacho — é a mesma baixa, só que em lote. Ver lib/baixa-lote.
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/session";
import { pendenciasDaOp, baixarSetorEmLote, SETORES_BAIXA_LOTE } from "@/lib/baixa-lote";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PAPEIS = ["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"];
const erroAuth = (e) => NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });

export async function GET(req) {
  try { await requireRole(PAPEIS); } catch (e) { return erroAuth(e); }
  const opId = new URL(req.url).searchParams.get("opId");
  if (!opId) return NextResponse.json({ error: "Informe a OP." }, { status: 400 });
  try {
    return NextResponse.json(await pendenciasDaOp(opId));
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Falha ao ler as pendências." }, { status: 500 });
  }
}

const schema = z.object({
  opId: z.string().min(1),
  setor: z.enum(SETORES_BAIXA_LOTE),
  // ⚠ obrigatório: baixa em lote sem motivo é o tipo de coisa que ninguém explica um mês depois
  motivo: z.string().trim().min(5, "Diga o motivo da baixa (mínimo 5 caracteres).").max(300),
});

export async function POST(req) {
  let user;
  try { user = await requireRole(PAPEIS); } catch (e) { return erroAuth(e); }
  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }
  try {
    const r = await baixarSetorEmLote({ ...body, user });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Falha ao dar baixa." }, { status: 500 });
  }
}
