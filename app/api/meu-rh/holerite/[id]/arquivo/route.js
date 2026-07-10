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
    select: { funcionarioId: true, arquivoUrl: true, arquivoNome: true, pagina: true, status: true, visualizadoEm: true },
  });
  // 404 genérico mesmo quando existe mas é de outro — não vaza existência.
  if (!h || h.funcionarioId !== user.funcionarioId || !h.arquivoUrl) {
    return NextResponse.json({ error: "Holerite não encontrado" }, { status: 404 });
  }

  try { assertBlobUrlSegura(h.arquivoUrl); }
  catch { return NextResponse.json({ error: "Arquivo inválido" }, { status: 400 }); }

  const res = await fetch(h.arquivoUrl);
  if (!res.ok || !res.body) return NextResponse.json({ error: "Falha ao buscar arquivo" }, { status: 502 });

  // Se `pagina` está setada, arquivoUrl é o PDF COMPLETO do lote → extrai só a
  // página deste funcionário (pdf-lib). Senão, arquivoUrl já é a página (legado).
  let corpo = res.body;
  if (h.pagina) {
    try {
      const full = Buffer.from(await res.arrayBuffer());
      const { PDFDocument } = await import("pdf-lib");
      const src = await PDFDocument.load(full);
      const out = await PDFDocument.create();
      const idx = Math.min(Math.max(h.pagina - 1, 0), src.getPageCount() - 1);
      const [pg] = await out.copyPages(src, [idx]);
      out.addPage(pg);
      corpo = await out.save();
    } catch {
      // Falhou a extração → devolve o PDF inteiro (melhor que erro).
      const r2 = await fetch(h.arquivoUrl);
      corpo = r2.body;
    }
  }

  // Marca como visualizado (sem regredir status já CONFIRMADO)
  if (!h.visualizadoEm) {
    await prisma.holerite.update({
      where: { id: params.id },
      data: { visualizadoEm: new Date(), ...(h.status === "ENVIADO" || h.status === "PENDENTE" ? { status: "VISUALIZADO" } : {}) },
    }).catch(() => {});
  }

  const nome = (h.arquivoNome || "holerite.pdf").replace(/["\r\n]/g, "");
  // ?download=1 → força o download (anexo); senão abre inline no navegador.
  const baixar = new URL(req.url).searchParams.get("download") === "1";
  const headers = new Headers();
  headers.set("Content-Type", "application/pdf");
  headers.set("Content-Disposition", `${baixar ? "attachment" : "inline"}; filename="${nome}"`);
  headers.set("Cache-Control", "private, no-store");
  return new Response(corpo, { status: 200, headers });
}
