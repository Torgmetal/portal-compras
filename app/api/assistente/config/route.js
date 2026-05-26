import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

// GET /api/assistente/config
// Retorna a config do Torguinho para o front saber se deve exibir o botão.
// Requer sessão válida mas não requer role específica.
export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ ativo: false });
  }

  let config = await prisma.configAssistente.findFirst();
  if (!config) {
    // Default: ativo para todos
    return NextResponse.json({ ativo: true, modulosHabilitados: [], modelo: "claude-haiku-4-5" });
  }

  const { ativo, modulosHabilitados, modelo } = config;
  return NextResponse.json({ ativo, modulosHabilitados, modelo });
}
