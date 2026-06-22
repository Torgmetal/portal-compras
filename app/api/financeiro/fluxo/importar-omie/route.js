import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { importarFluxoExtrato } from "@/lib/omie-extrato";

// Importa o extrato de conta corrente do Omie (realizado + previsto, com
// transferências marcadas) para o FluxoCaixa, reconciliando o período.
export const maxDuration = 60;

const schema = z.object({
  de:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "FINANCEIRO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ error: e.message }, { status });
  }

  let body;
  try { body = schema.parse(await req.json()); }
  catch { return NextResponse.json({ error: "Período inválido (use YYYY-MM-DD)" }, { status: 400 }); }

  try {
    const r = await importarFluxoExtrato({ de: body.de, ate: body.ate, userId: user.id });
    try {
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: "IMPORTAR_FLUXO_OMIE",
          entity: "FluxoCaixa",
          entityId: `${body.de}..${body.ate}`,
          diff: { periodo: body, criados: r.criados, apagados: r.apagados, totais: r.totais },
        },
      });
    } catch (e) { console.error("AuditLog importar-omie:", e?.message); }
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error("[importar-omie] erro:", e?.message);
    return NextResponse.json({ error: e?.message || "Erro ao importar" }, { status: 500 });
  }
}
