// Remove um anexo de uma cotacao (PDF/imagem da proposta).
// Apaga registro no DB E o arquivo no Vercel Blob. Best-effort no blob.
import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export async function DELETE(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Apenas Admin ou Compras." }, { status: 403 });
  }

  const anexo = await prisma.anexo.findUnique({ where: { id: params.anexoId } });
  if (!anexo || anexo.cotacaoId !== params.id) {
    return NextResponse.json({ error: "Anexo nao encontrado nessa cotacao." }, { status: 404 });
  }

  try {
    if (process.env.BLOB_READ_WRITE_TOKEN) await del(anexo.blobUrl);
  } catch (e) {
    console.error("[cotacao anexo delete] falha blob:", e?.message);
  }

  await prisma.anexo.delete({ where: { id: anexo.id } });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "delete_cotacao_anexo",
      entity: "Anexo",
      entityId: anexo.id,
      diff: { cotacaoId: anexo.cotacaoId, nomeArquivo: anexo.nomeArquivo },
    },
  });

  return NextResponse.json({ ok: true });
}
