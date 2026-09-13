import { z } from "zod";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { carregarFilaOperador } from "@/lib/fila-operador-servidor";
export const maxDuration = 60;
const entrada = z.enum([
  "CORTE",
  "MONTAGEM",
  "SOLDA",
  "ACABAMENTO",
  "JATO",
  "PINTURA",
]);
export async function GET(req) {
  try {
    await requireRole(["ADMIN", "PRODUCAO", "PCP", "PLANEJAMENTO"]);
  } catch (e) {
    return NextResponse.json(
      { error: e.message },
      { status: e.message === "Unauthorized" ? 401 : 403 },
    );
  }
  const s = entrada.safeParse(new URL(req.url).searchParams.get("setor"));
  if (!s.success)
    return NextResponse.json(
      { error: "Selecione um setor válido." },
      { status: 400 },
    );
  try {
    const dados = await carregarFilaOperador({
      atualizar: new URL(req.url).searchParams.get("consultaAtual") === "1",
    });
    return NextResponse.json(
      { ...dados, lotes: dados.lotes.filter((l) => l.setor === s.data) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Não foi possível atualizar sua fila de trabalho." },
      { status: 500 },
    );
  }
}
