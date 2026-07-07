// POST /api/relatorios/foto  (multipart: file) → sobe a foto no Blob e devolve { url }.
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireRole } from "@/lib/session";
import { MODS_RELATORIOS } from "@/lib/relatorios";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX = 15 * 1024 * 1024; // 15MB (o front reduz a imagem antes de subir)
const TIPOS = new Set(["image/jpeg", "image/png"]);

export async function POST(req) {
  try { await requireRole(MODS_RELATORIOS); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  if (!process.env.BLOB_READ_WRITE_TOKEN) return NextResponse.json({ error: "Storage de arquivos não configurado" }, { status: 500 });

  let form;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "Envie a imagem" }, { status: 400 }); }
  const file = form.get("file");
  if (!file || typeof file === "string") return NextResponse.json({ error: "Campo 'file' obrigatório" }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: `Imagem muito grande (máx ${MAX / 1024 / 1024}MB)` }, { status: 413 });
  const tipo = (file.type || "").toLowerCase();
  if (!TIPOS.has(tipo)) return NextResponse.json({ error: "Use JPG ou PNG (no PDF só entram esses formatos)" }, { status: 415 });

  const ext = tipo === "image/png" ? "png" : "jpg";
  const buf = Buffer.from(await file.arrayBuffer());
  const blob = await put(`relatorios/fotos/foto.${ext}`, buf, { access: "public", addRandomSuffix: true, contentType: tipo });
  return NextResponse.json({ success: true, url: blob.url });
}
