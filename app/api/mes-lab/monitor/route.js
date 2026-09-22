// O PANORAMA DA FÁBRICA — o que alimenta o monitor da supervisão.
//
// ⚠⚠ SÓ GET, E É DE PROPÓSITO. Esta rota não tem POST, PATCH nem DELETE: o monitor fica aberto o
// dia inteiro numa TV se atualizando sozinho, e um defeito num caminho de escrita daqui viraria
// apontamento fantasma repetido a cada 15 segundos. Quem escreve é o totem.
//
// ⚠ A REGRA NÃO MORA AQUI — está em `lib/mes/monitor.js`. Esta rota traduz HTTP.
//
// ⚠⚠ ÁREA DE LABORATÓRIO. `/mes-lab` é ADMIN-only no `middleware.js`, mas o gate do middleware
// cobre PÁGINA, não API — por isso `requireRole` aqui também (§7.4, pedido do Codex).

import { NextResponse } from "next/server";
// ⚠ `panoramaDaFabrica` recebe o cliente do MES; a programação que ela lê do portal ela
// importa por dentro, explicitamente (ver `lib/mes/monitor.js`).
import { mesPrisma as prisma } from "@/lib/mes/prisma";
import { requireRole } from "@/lib/session";
import { panoramaDaFabrica } from "@/lib/mes/monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireRole(["ADMIN"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message },
      { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const panorama = await panoramaDaFabrica(prisma);
  return NextResponse.json({ success: true, ...panorama });
}
