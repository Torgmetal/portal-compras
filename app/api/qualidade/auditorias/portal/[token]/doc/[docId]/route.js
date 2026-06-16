// GET /api/qualidade/auditorias/portal/[token]/doc/[docId] — PÚBLICO: baixa um documento
// compartilhado na auditoria (resolve a fonte: Blob ou SharePoint). Sem login.
import { prisma } from "@/lib/prisma";
import { downloadFileById } from "@/lib/sharepoint";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req, { params }) {
  const doc = await prisma.auditoriaDoc.findFirst({
    where: { id: params.docId, tipo: "EVIDENCIA", auditoria: { token: params.token, status: "PUBLICADO" } },
  });
  if (!doc) return new Response("Documento indisponível.", { status: 404 });

  const inline = new URL(req.url).searchParams.get("inline") === "1";
  const filename = (doc.nome || "documento").replace(/[\r\n"]/g, "");

  try {
    let buffer, contentType;
    if (doc.arquivoUrl) {
      const r = await fetch(doc.arquivoUrl);
      if (!r.ok) throw new Error("blob");
      buffer = Buffer.from(await r.arrayBuffer());
      contentType = doc.arquivoTipo || r.headers.get("content-type") || "application/octet-stream";
    } else if (doc.sharepointItemId) {
      const driveId = process.env.SHAREPOINT_DRIVE_ID;
      const res = await downloadFileById(driveId, doc.sharepointItemId);
      buffer = res.buffer;
      contentType = doc.arquivoTipo || res.contentType || "application/octet-stream";
    } else {
      return new Response("Documento sem arquivo.", { status: 404 });
    }
    return new Response(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
      },
    });
  } catch {
    return new Response("Falha ao obter o documento.", { status: 502 });
  }
}
