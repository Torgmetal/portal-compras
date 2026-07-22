// GET — serve o arquivo do desenho. UPLOAD → redireciona pro Blob; SHAREPOINT →
// baixa do drive da obra (proxy) e devolve. PDF abre inline (visualização);
// os demais (DWG) baixam.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { downloadFileById } from "@/lib/sharepoint";

export const runtime = "nodejs";
export const maxDuration = 60;
const ROLES = ["ADMIN", "ENGENHARIA", "COMERCIAL", "PLANEJAMENTO", "PCP"];

export async function GET(_req, { params }) {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const d = await prisma.desenhoOP.findFirst({ where: { id: params.desenhoId, opId: params.id } });
  if (!d) return NextResponse.json({ error: "Desenho não encontrado" }, { status: 404 });

  const isPdf = (d.ext || "").toLowerCase() === "pdf";
  const nomeSeguro = String(d.nome || "desenho").replace(/["\r\n]/g, "");

  if (d.origem === "UPLOAD") {
    if (!d.url) return NextResponse.json({ error: "Arquivo sem URL" }, { status: 404 });
    return NextResponse.redirect(d.url); // Blob público: PDF abre inline, DWG baixa
  }

  // SHAREPOINT — proxy pelo Graph
  if (!d.driveId || !d.itemId) return NextResponse.json({ error: "Referência do SharePoint incompleta" }, { status: 404 });
  let file;
  try { file = await downloadFileById(d.driveId, d.itemId); }
  catch (e) { return NextResponse.json({ error: "Falha ao buscar o arquivo na pasta da obra: " + (e?.message || "") }, { status: 502 }); }

  return new Response(file.buffer, {
    status: 200,
    headers: {
      "Content-Type": isPdf ? "application/pdf" : (file.contentType || "application/octet-stream"),
      "Content-Disposition": `${isPdf ? "inline" : "attachment"}; filename="${nomeSeguro}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
