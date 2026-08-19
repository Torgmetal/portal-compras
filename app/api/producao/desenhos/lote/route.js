// EMITIR EM LOTE os desenhos carimbados de várias marcas de uma vez.
// POST { opNumero, marcas[], setor?, acao: "EMITIR"|"IMPRIMIR" }
// Devolve um arquivo POR FORMATO (A1/A2/A3/A4) — cada um vai numa bandeja diferente da
// impressora, então PDF único misturado não serve. (Vitor 19/08.)
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { emitirLoteDesenhos } from "@/lib/desenhos-lote";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // baixar + carimbar + juntar dezenas de A1

const ROLES = ["ADMIN", "PLANEJAMENTO", "PCP", "PRODUCAO", "COMERCIAL"];

const schema = z.object({
  opNumero: z.string().min(1),
  marcas: z.array(z.string()).min(1),
  setor: z.string().nullable().optional(),
  acao: z.enum(["EMITIR", "IMPRIMIR"]).default("EMITIR"),
});

export async function POST(req) {
  let user;
  try { user = await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  try {
    const r = await emitirLoteDesenhos({ ...body, user });
    await prisma.auditLog.create({
      data: {
        userId: user.id, action: body.acao === "IMPRIMIR" ? "GRD_IMPRIMIR_LOTE" : "EMITIR_LOTE_RASTREADO",
        entity: "GrdLiberacao", entityId: r.op.numero,
        diff: { op: r.op.numero, setor: body.setor, marcas: body.marcas.length, emitidas: r.emitidas, arquivos: r.arquivos.map((a) => `${a.formato}:${a.paginas}p`), semDesenho: r.semDesenho.length, erros: r.erros.length, grds: r.grds },
      },
    }).catch(() => {});
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
