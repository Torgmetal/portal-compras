import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { aquecerBanco } from "@/lib/db-retry";
import { temCronSecret } from "@/lib/cron-auth";
import { importarLegislacao } from "@/lib/fiscal/importar-legislacao";

// ⚠⚠ `force-dynamic` OU O CRON É PRÉ-RENDERIZADO E NUNCA RODA. Um `GET()` sem `req` e sem
// `headers()` vira rota ESTÁTICA (`○`) no build do Next: ele executa uma vez durante o build e
// serve a resposta congelada para sempre. Já aconteceu com o cron da TIPI neste mesmo módulo.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req) {
  if (!temCronSecret(req)) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  // ⚠ Cold start do Neon: o primeiro query estoura antes de a compute acordar.
  await aquecerBanco(prisma);
  const r = await importarLegislacao();
  return NextResponse.json({ success: true, ...r });
}
