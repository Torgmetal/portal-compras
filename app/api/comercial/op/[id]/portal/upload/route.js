// POST — sobe uma imagem do portal (capa, logo do cliente ou foto da obra).
//
// Vitor (22/08/2026): "você consegue montar com as artes que temos para colocarmos no ar? Quero
// que tenha o logo da Torg e logo do cliente".
//
// ⚠ TOKEN DE CLIENTE, não upload pela rota. Foto de obra sai do celular com 8 a 12 MB — o dobro do
// teto em que a rota serverless trava. Pela rota, quem sobe veria "não anexa" sem entender que o
// problema era o tamanho.
import { NextResponse } from "next/server";
import { handleUpload } from "@vercel/blob/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 30;

const PERFIS = ["ADMIN", "COMERCIAL", "QUALIDADE", "PLANEJAMENTO"];

export async function POST(req, { params }) {
  try { await requireRole(PERFIS); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { id } = await params;
  const op = await prisma.oP.findUnique({ where: { id }, select: { numero: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });

  const body = await req.json();
  try {
    const resposta = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => ({
        // PNG e SVG entram por causa do logo do cliente, que quase nunca é JPG
        allowedContentTypes: ["image/jpeg", "image/png", "image/webp", "image/svg+xml"],
        maximumSizeInBytes: 20 * 1024 * 1024,
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ opNumero: op.numero }),
      }),
      // ⚠ nada é gravado aqui: quem decide se a imagem virou capa, logo ou foto é a tela, no PUT
      // seguinte. O upload só devolve a URL — assim trocar a capa não apaga a anterior sem querer.
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(resposta);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
