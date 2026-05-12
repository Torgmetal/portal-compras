// Remove um anexo da RM. Apaga o registro no DB E o arquivo no Vercel Blob.
import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export async function DELETE(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMPRAS", "ENGENHARIA", "COMERCIAL"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao." }, { status: 403 });
  }

  const anexo = await prisma.anexo.findUnique({ where: { id: params.anexoId } });
  if (!anexo || anexo.rmId !== params.id) {
    return NextResponse.json({ error: "Anexo nao encontrado nessa RM." }, { status: 404 });
  }

  // Tenta apagar do blob (best-effort — se falhar, ainda remove o registro)
  try {
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      await del(anexo.blobUrl);
    }
  } catch (e) {
    console.error("[anexo delete] falha removendo do blob:", e?.message);
  }

  await prisma.anexo.delete({ where: { id: anexo.id } });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "delete_anexo_rm",
      entity: "RM",
      entityId: params.id,
      diff: { nomeArquivo: anexo.nomeArquivo },
    },
  });

  return NextResponse.json({ ok: true });
}
