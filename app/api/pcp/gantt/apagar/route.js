// POST /api/pcp/gantt/apagar → apaga uma programação e tira as peças da fila
//   { blocos: [{ setor, ids[], marcas[]?, recurso?, dia? }], motivo }
//
// ⚠ ROTA SEPARADA DA DE PROGRAMAR, de propósito. `/api/pcp/gantt` grava dia e recurso; esta
// APAGA e ainda mexe na liberação do Planejamento. Misturar as duas num parâmetro de ação faria a
// permissão e a auditoria das duas passarem pelo mesmo lugar — e são atos diferentes.
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/session";
import { apagarProgramacao, SETORES_GANTT } from "@/lib/gantt-pcp";

export const dynamic = "force-dynamic";

const schema = z.object({
  blocos: z.array(z.object({
    setor: z.enum(SETORES_GANTT),
    ids: z.array(z.string()).min(1),
    marcas: z.array(z.string()).optional(),
    recurso: z.string().trim().max(60).nullable().optional(),
    dia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  })).min(1, "Nada para apagar").max(400),
  motivo: z.string().trim().min(1, "Informe o motivo").max(200),
});

export async function POST(req) {
  let user;
  try { user = await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  try {
    const r = await apagarProgramacao(body.blocos, user, body.motivo);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
