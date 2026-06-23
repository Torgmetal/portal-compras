// GET /api/planejamento/status-obra            → listas já importadas (resumo)
// GET /api/planejamento/status-obra?descobrir=1 → varre o SharePoint e lista as
//     OPs que têm Lista Avançada (só metadados, sem baixar) p/ o usuário importar.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { descobrirListas } from "@/lib/lista-avancada-sharepoint";

export const runtime = "nodejs";
export const maxDuration = 120;

const ROLES = ["ADMIN", "PLANEJAMENTO", "ENGENHARIA", "EXPEDICAO", "PRODUCAO"];

export async function GET(req) {
  try {
    await requireRole(ROLES);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  if (new URL(req.url).searchParams.get("descobrir")) {
    try {
      const opsComLista = await descobrirListas();
      return NextResponse.json({ opsComLista });
    } catch (e) {
      return NextResponse.json({ error: "Falha ao varrer o SharePoint: " + (e?.message || "") }, { status: 502 });
    }
  }

  const listas = await prisma.listaExpedicao.findMany({
    select: {
      id: true, frente: true, opNumero: true, arquivo: true, revisao: true,
      fileModificado: true, marcas: true, qtdItens: true,
      pesoContratado: true, pesoExpedido: true, pesoFaltante: true,
      expedidasArquivo: true, importadoEm: true,
    },
    orderBy: [{ opNumero: "asc" }, { frente: "asc" }],
  });
  return NextResponse.json({ listas });
}
