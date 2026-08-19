// LÊ A PLANILHA DE ESTUDO do Comercial (SharePoint) e devolve o que ela diz — peso do aço por
// área, área de pintura, litros de tinta e as famílias (telha, calhas, rufos…) por área.
//
// ⚠ Rota separada de `/api/comercial/estudo`, que é o módulo de Estudo do Comercial (banco).
// Aqui não há entidade nenhuma: é só leitura de arquivo pra vincular na criação da OP.
//
// POST { itemId, nome? } → { modelo, aco, pintura, familias, faltando }
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/session";
import { getAccessToken } from "@/lib/sharepoint";
import { lerEstudoComercial, lerNomeEstudo } from "@/lib/estudo-comercial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120; // estudo passa de 9 MB em obra grande

const ROLES = ["ADMIN", "COMERCIAL", "PLANEJAMENTO", "PCP"];
const schema = z.object({ itemId: z.string().regex(/^[A-Za-z0-9_\-!.]+$/), nome: z.string().optional() });

export async function POST(req) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let body;
  try { body = schema.parse(await req.json()); }
  catch { return NextResponse.json({ error: "Arquivo inválido." }, { status: 400 }); }

  try {
    const token = await getAccessToken();
    const r = await fetch(`https://graph.microsoft.com/v1.0/drives/${process.env.SHAREPOINT_DRIVE_ID}/items/${body.itemId}/content`, {
      headers: { Authorization: `Bearer ${token}` }, redirect: "follow",
    });
    if (!r.ok) throw new Error(`SharePoint HTTP ${r.status}`);
    const estudo = await lerEstudoComercial(Buffer.from(await r.arrayBuffer()));
    return NextResponse.json({ ...estudo, arquivo: body.nome || null, ref: lerNomeEstudo(body.nome || "") });
  } catch (e) {
    return NextResponse.json({ error: e.message || "Não consegui ler a planilha." }, { status: 400 });
  }
}
