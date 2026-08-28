// Proxy do PDF do desenho (SharePoint → navegador, inline) — a pessoa visualiza e imprime
// direto da aba do navegador, sem credencial do SharePoint.
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { getAccessToken } from "@/lib/sharepoint";
import { dispArquivo } from "@/lib/arquivo-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ROLES = ["ADMIN", "PLANEJAMENTO", "PCP", "PRODUCAO", "COMERCIAL"];

export async function GET(req) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const sp = new URL(req.url).searchParams;
  const itemId = sp.get("itemId");
  if (!itemId || !/^[A-Za-z0-9_\-!.]+$/.test(itemId)) return NextResponse.json({ error: "itemId inválido." }, { status: 400 });

  const token = await getAccessToken();
  const driveId = process.env.SHAREPOINT_DRIVE_ID;
  const res = await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/content`, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: "follow",
  });
  if (!res.ok) return NextResponse.json({ error: `SharePoint HTTP ${res.status}` }, { status: 502 });

  const nome = decodeURIComponent(sp.get("nome") || "desenho.pdf").replace(/[^\w. \-()]/g, "_");
  return new NextResponse(res.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": dispArquivo(nome, "inline"),
      "Cache-Control": "private, max-age=300",
    },
  });
}
