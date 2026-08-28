// POST /api/admin/usuarios/[id]/assinatura  (multipart: file) → guarda a imagem da assinatura
// DELETE                                                      → tira a imagem do cadastro
//
// ⚠ A imagem chega PRONTA do navegador (lib/assinatura-imagem.js): girada, sem fundo e recortada.
// Aqui só se confere tamanho e formato — tratar foto de 4032px no serverless seria trocar um
// trabalho que o navegador faz de graça por tempo de função e risco de estourar o limite do upload.
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX = 4 * 1024 * 1024;
const TIPOS = new Set(["image/png", "image/jpeg"]);

export async function POST(req, { params }) {
  let admin;
  try { admin = await requireRole(["ADMIN"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  if (!process.env.BLOB_READ_WRITE_TOKEN) return NextResponse.json({ error: "Storage de arquivos não configurado" }, { status: 500 });

  const alvo = await prisma.user.findUnique({ where: { id: params.id }, select: { id: true, name: true } });
  if (!alvo) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });

  let form;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "Envie a imagem." }, { status: 400 }); }
  const file = form.get("file");
  if (!file || typeof file === "string") return NextResponse.json({ error: "Campo 'file' obrigatório." }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "Imagem muito grande (máx 4MB depois do tratamento)." }, { status: 413 });
  const tipo = (file.type || "").toLowerCase();
  if (!TIPOS.has(tipo)) return NextResponse.json({ error: "Use PNG ou JPG." }, { status: 415 });

  const buf = Buffer.from(await file.arrayBuffer());
  const blob = await put(`usuarios/assinaturas/${alvo.id}.${tipo === "image/png" ? "png" : "jpg"}`, buf, {
    access: "public", addRandomSuffix: true, contentType: tipo,
  });
  await prisma.user.update({ where: { id: alvo.id }, data: { assinaturaUrl: blob.url } });
  await prisma.auditLog.create({ data: { userId: admin.id, action: "ASSINATURA_USUARIO", entity: "User", entityId: alvo.id, diff: { nome: alvo.name } } }).catch(() => {});
  // ⚠ devolve só a confirmação: a tela busca a imagem pela rota que confere quem está pedindo.
  return NextResponse.json({ success: true });
}

export async function DELETE(_req, { params }) {
  let admin;
  try { admin = await requireRole(["ADMIN"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  // ⚠ o arquivo no Blob NÃO é apagado: documento já assinado guarda a URL que usou, e apagar aqui
  // esvaziaria a assinatura de um relatório que já saiu. Sai só do cadastro.
  await prisma.user.update({ where: { id: params.id }, data: { assinaturaUrl: null } });
  await prisma.auditLog.create({ data: { userId: admin.id, action: "ASSINATURA_USUARIO_REMOVIDA", entity: "User", entityId: params.id, diff: {} } }).catch(() => {});
  return NextResponse.json({ success: true });
}
