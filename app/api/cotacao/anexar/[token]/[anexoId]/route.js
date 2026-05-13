// Remove anexo da propria cotacao via token publico — usado pelo
// portal do fornecedor quando ele quer trocar o PDF que mandou.
// Valida que o anexo pertence a cotacao do token (sem precisar de auth).
import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";

export async function DELETE(req, { params }) {
  const cotacao = await prisma.cotacao.findUnique({
    where: { token: params.token },
    select: { id: true, status: true },
  });
  if (!cotacao) return NextResponse.json({ error: "Token invalido." }, { status: 404 });
  if (cotacao.status === "CANCELADA") {
    return NextResponse.json({ error: "Cotacao cancelada." }, { status: 409 });
  }

  const anexo = await prisma.anexo.findUnique({ where: { id: params.anexoId } });
  if (!anexo || anexo.cotacaoId !== cotacao.id) {
    return NextResponse.json({ error: "Anexo nao encontrado nessa cotacao." }, { status: 404 });
  }

  try {
    if (process.env.BLOB_READ_WRITE_TOKEN) await del(anexo.blobUrl);
  } catch (e) {
    console.error("[fornecedor anexo delete] falha blob:", e?.message);
  }

  await prisma.anexo.delete({ where: { id: anexo.id } });

  await prisma.auditLog.create({
    data: {
      userId: null,
      action: "delete_cotacao_anexo_fornecedor",
      entity: "Anexo",
      entityId: anexo.id,
      diff: { cotacaoId: anexo.cotacaoId, nomeArquivo: anexo.nomeArquivo, via: "portal_fornecedor" },
    },
  });

  return NextResponse.json({ ok: true });
}
