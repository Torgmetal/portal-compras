// POST /api/comercial/op/[id]/atas/[ataId]/ia
// Cola o texto/transcrição da reunião e a IA organiza numa ata padronizada
// (resumo + tópicos + ações), salva em conteudoJson + guarda o texto na pauta.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { extrairAta } from "@/lib/extrair-ata";

export const runtime = "nodejs";
export const maxDuration = 60;
const ROLES = ["ADMIN", "COMERCIAL", "PLANEJAMENTO", "PCP"];

export async function POST(req, { params }) {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const ata = await prisma.ataOP.findFirst({ where: { id: params.ataId, opId: params.id }, select: { id: true } });
  if (!ata) return NextResponse.json({ error: "Ata não encontrada" }, { status: 404 });

  let body = {};
  try { body = await req.json(); } catch { /* */ }
  const texto = String(body.texto || "").trim();
  if (!texto) return NextResponse.json({ error: "Cole o texto da reunião para a IA organizar." }, { status: 400 });

  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  let out;
  try { out = await extrairAta({ texto, hoje }); }
  catch (e) { return NextResponse.json({ error: "Erro ao analisar com a IA: " + (e?.message || "") }, { status: 502 }); }
  if (!out) return NextResponse.json({ error: "A IA não retornou conteúdo." }, { status: 400 });

  const data = { conteudoJson: { resumo: out.resumo, topicos: out.topicos, acoes: out.acoes }, pauta: texto };
  if (out.titulo) data.titulo = out.titulo;
  if (out.participantes) data.participantes = out.participantes;

  const atualizada = await prisma.ataOP.update({ where: { id: ata.id }, data });
  return NextResponse.json({ success: true, ata: atualizada });
}
