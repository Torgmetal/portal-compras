// GET /api/usuarios/assinatura/[id] — a imagem da assinatura de um usuário.
//
// ⚠⚠ A ASSINATURA É DA PESSOA E DE MAIS NINGUÉM. Vitor (28/08/2026): "essa assinatura tem que ficar
// restrita a esse usuário, não sendo possível ser usada por mais ninguém". Por isso a URL do Blob
// NUNCA sai do servidor: o portal guarda o endereço, mas quem pede a imagem passa por aqui e
// precisa ser o DONO dela (ou um ADMIN, que é quem a cadastra). Sem isso, o link do Blob — que é
// público para quem o tem — viraria uma assinatura solta circulando por aí.
//
// ⚠ Nos documentos a imagem NÃO passa por esta rota: o gerador do PDF lê o Blob direto no servidor,
// já com a assinatura amarrada a quem assinou. Aqui é só a conferência na tela.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { isBlobUrlSegura } from "@/lib/blob-url";

export const runtime = "nodejs";

export async function GET(_req, { params }) {
  let user;
  try { user = await requireUser(); }
  catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }

  const dono = params.id === user.id;
  if (!dono && user.tipo !== "ADMIN") {
    return NextResponse.json({ error: "Esta assinatura é de outro usuário." }, { status: 403 });
  }

  const u = await prisma.user.findUnique({ where: { id: params.id }, select: { assinaturaUrl: true } });
  if (!u?.assinaturaUrl) return NextResponse.json({ error: "Sem assinatura cadastrada." }, { status: 404 });
  if (!isBlobUrlSegura(u.assinaturaUrl)) return NextResponse.json({ error: "Arquivo inválido." }, { status: 400 });

  const r = await fetch(u.assinaturaUrl);
  if (!r.ok || !r.body) return NextResponse.json({ error: "Falha ao buscar a imagem." }, { status: 502 });
  return new NextResponse(r.body, {
    headers: {
      "Content-Type": r.headers.get("content-type") || "image/png",
      // ⚠ nunca em cache compartilhado: é dado pessoal servido sob sessão
      "Cache-Control": "private, no-store",
    },
  });
}
