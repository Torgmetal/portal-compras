// GET /api/meu-rh/holerite/[id]/arquivo — proxy autenticado do PDF do holerite do
// próprio funcionário (o link do Blob nunca é exposto). Marca VISUALIZADO na 1ª vez.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFuncionario } from "@/lib/session";
import { assertBlobUrlSegura } from "@/lib/blob-url";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req, { params }) {
  let user;
  try {
    user = await requireFuncionario();
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const h = await prisma.holerite.findUnique({
    where: { id: params.id },
    select: { funcionarioId: true, arquivoUrl: true, arquivoNome: true, status: true, visualizadoEm: true },
  });
  // 404 genérico mesmo quando existe mas é de outro — não vaza existência.
  if (!h || h.funcionarioId !== user.funcionarioId || !h.arquivoUrl) {
    return NextResponse.json({ error: "Holerite não encontrado" }, { status: 404 });
  }

  try { assertBlobUrlSegura(h.arquivoUrl); }
  catch { return NextResponse.json({ error: "Arquivo inválido" }, { status: 400 }); }

  const res = await fetch(h.arquivoUrl);
  if (!res.ok || !res.body) return NextResponse.json({ error: "Falha ao buscar arquivo" }, { status: 502 });

  // Marca como visualizado (sem regredir status já CONFIRMADO)
  if (!h.visualizadoEm) {
    await prisma.holerite.update({
      where: { id: params.id },
      data: { visualizadoEm: new Date(), ...(h.status === "ENVIADO" || h.status === "PENDENTE" ? { status: "VISUALIZADO" } : {}) },
    }).catch(() => {});
  }

  const nome = (h.arquivoNome || "holerite.pdf").replace(/["\r\n]/g, "");
  const headers = new Headers();
  headers.set("Content-Type", "application/pdf");
  headers.set("Content-Disposition", `inline; filename="${nome}"`);
  headers.set("Cache-Control", "private, no-store");
  return new Response(res.body, { status: 200, headers });
}
