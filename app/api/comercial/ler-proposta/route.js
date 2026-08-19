// LÊ UMA PROPOSTA (PDF) do SharePoint e diz o que ela contém — técnica, comercial ou as duas
// (PTC), com prazo de execução, validade e escopo.
//
// Vitor (19/08): "deixar anexar mais de uma proposta, assim você avalia e informa o que contém em
// cada uma" — em vez de a pessoa rotular o documento na mão, adivinhando.
//
// POST { itemId, nome? } → { tipo, tecnica, comercial, prazoDias, validadeDias, escopo, paginas }
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/session";
import { getAccessToken } from "@/lib/sharepoint";
import { lerProposta } from "@/lib/proposta-comercial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
    return NextResponse.json(await lerProposta(Buffer.from(await r.arrayBuffer()), body.nome || null));
  } catch (e) {
    return NextResponse.json({ error: e.message || "Não consegui ler a proposta." }, { status: 400 });
  }
}
