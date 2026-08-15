// GET /api/qualidade/sgq?path=<subpasta> — navega a pasta do SGQ (ISO 9001) no servidor.
// Só LEITURA/consulta: lista pastas e arquivos com data de modificação e link p/ abrir no
// SharePoint. A edição continua no servidor (Vitor 09/08). Navegação lazy (por nível).
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { getAccessToken } from "@/lib/sharepoint";

export const runtime = "nodejs";
export const maxDuration = 30;

const DRIVE = process.env.SHAREPOINT_DRIVE_ID;
const BASE = "/Administrativo/SGQ ISO 9001-2015";
const enc = (p) => p.split("/").filter(Boolean).map(encodeURIComponent).join("/");

export async function GET(req) {
  try { await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const sub = (new URL(req.url).searchParams.get("path") || "").replace(/^\/+|\/+$/g, "");
  if (sub.split("/").some((s) => s === "..")) return NextResponse.json({ error: "caminho inválido" }, { status: 400 });
  const full = sub ? `${BASE}/${sub}` : BASE;

  let token;
  try { token = await getAccessToken(); }
  catch { return NextResponse.json({ path: sub, itens: [], erro: "SharePoint indisponível" }, { status: 502 }); }

  const url = `https://graph.microsoft.com/v1.0/drives/${DRIVE}/root:/${enc(full)}:/children?$select=id,name,folder,file,size,lastModifiedDateTime,webUrl&$top=400`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return NextResponse.json({ path: sub, itens: [], erro: `pasta não acessível (${r.status})` });

  const itens = ((await r.json()).value || []).map((it) => ({
    id: it.id, // driveItem id — usado p/ anexar o arquivo na auditoria (sharepointItemId)
    nome: it.name,
    tipo: it.folder ? "folder" : "file",
    filhos: it.folder?.childCount ?? null,
    tamanho: it.size ?? null,
    mime: it.file?.mimeType || null,
    modificado: it.lastModifiedDateTime || null,
    webUrl: it.webUrl || null,
  }));
  // pastas primeiro, depois arquivos; cada grupo por nome (ordem natural)
  itens.sort((a, b) => (a.tipo === b.tipo ? a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }) : a.tipo === "folder" ? -1 : 1));
  return NextResponse.json({ path: sub, itens });
}
