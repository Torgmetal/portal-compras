// GET /api/producao/pecas/sharepoint-drives
// Lista as bibliotecas (drives) do site SharePoint para descobrir o drive ID
// da biblioteca SERVIDOR (onde estão as pastas das OPs com os LPC).
//
// Uso: abrir no navegador logado como ADMIN, ou via fetch. Retorna { drives: [{name, id}] }.
//
// Config opcional (.env): SHAREPOINT_SITE_HOST e SHAREPOINT_SITE_PATH
//   default: torgmetal637.sharepoint.com / sites/TorgMetal

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { getAccessToken } from "@/lib/sharepoint";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireRole(["ADMIN", "PRODUCAO"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const host = process.env.SHAREPOINT_SITE_HOST || "torgmetal637.sharepoint.com";
  const sitePath = process.env.SHAREPOINT_SITE_PATH || "sites/TorgMetal";

  try {
    const token = await getAccessToken();

    // Resolve o siteId
    const siteRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${host}:/${sitePath}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!siteRes.ok) {
      return NextResponse.json({ error: `Falha ao resolver site (${siteRes.status}): ${(await siteRes.text()).slice(0,300)}` }, { status: 502 });
    }
    const site = await siteRes.json();

    // Lista os drives do site
    const drivesRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${site.id}/drives?$select=id,name,webUrl,driveType`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!drivesRes.ok) {
      return NextResponse.json({ error: `Falha ao listar drives (${drivesRes.status}): ${(await drivesRes.text()).slice(0,300)}` }, { status: 502 });
    }
    const drives = await drivesRes.json();

    return NextResponse.json({
      site: { id: site.id, name: site.displayName || site.name, url: site.webUrl },
      drives: (drives.value || []).map(d => ({ name: d.name, id: d.id, url: d.webUrl })),
      dica: "Copie o 'id' do drive chamado SERVIDOR e configure SHAREPOINT_SERVIDOR_DRIVE_ID no Vercel.",
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
