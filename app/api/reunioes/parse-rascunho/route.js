// Recebe um rascunho em texto livre + os envolvidos e devolve as atividades
// organizadas pela IA (por OP, com setor/responsável quando dá pra deduzir).
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { extrairAtividadesAta } from "@/lib/extrair-atividades-ata";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req) {
  try { await requireRole(["ADMIN", "PLANEJAMENTO"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const rascunho = (body?.rascunho || "").toString();
  if (!rascunho.trim()) return NextResponse.json({ error: "Cole o rascunho das atividades." }, { status: 400 });
  const envolvidos = Array.isArray(body?.envolvidos) ? body.envolvidos : [];
  const hoje = new Date().toISOString().slice(0, 10);

  try {
    const { atividades } = await extrairAtividadesAta({ rascunho, envolvidos, hoje });
    return NextResponse.json({ success: true, atividades });
  } catch (e) {
    console.error("parse-rascunho ata:", e?.message || e);
    return NextResponse.json({ error: "Não foi possível organizar o rascunho agora. Tente novamente." }, { status: 500 });
  }
}
