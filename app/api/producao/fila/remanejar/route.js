import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/session";
import { aplicarRemanejo } from "@/lib/gantt-pcp";
import { BANCADAS_CONSULTA_MONTAGEM } from "@/lib/postos-operador";
import { invalidarFilaOperador } from "@/lib/fila-operador-servidor";
export const maxDuration = 60;
const entrada = z.object({
  recurso: z.enum(BANCADAS_CONSULTA_MONTAGEM),
  dia: z.iso.date(),
  fracoes: z
    .array(
      z.object({
        id: z
          .string()
          .min(1)
          .max(100)
          .refine(
            (id) => !id.startsWith("retorno:") && !id.startsWith("previsao:"),
          ),
        inicio: z.number().int().min(0),
        quantidade: z.number().int().min(1),
        qTotal: z.number().int().min(1),
        diaOrigem: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        recursoOrigem: z.string().min(1).max(60),
      }),
    )
    .min(1)
    .max(2000),
});
export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "PRODUCAO", "PCP", "PLANEJAMENTO"]);
  } catch (e) {
    return NextResponse.json(
      { error: e.message },
      { status: e.message === "Unauthorized" ? 401 : 403 },
    );
  }
  const parsed = entrada.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Dados inválidos." },
      { status: 400 },
    );
  try {
    const { recurso, dia, fracoes } = parsed.data;
    const resultado = await aplicarRemanejo(
      [
        {
          setor: "MONTAGEM",
          recurso,
          dia,
          fracoes,
          ids: [...new Set(fracoes.map((f) => f.id))],
        },
      ],
      user,
      { somenteSaldo: true },
    );
    invalidarFilaOperador();
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e) {
    return NextResponse.json(
      { error: e.message || "Não foi possível remanejar." },
      { status: 400 },
    );
  }
}
