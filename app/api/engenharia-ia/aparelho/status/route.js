// POST /api/engenharia-ia/aparelho/status — o app consulta o pareamento com o segredo de espera.
// Quando o ADMIN aprova, a PRIMEIRA consulta recebe o token do aparelho — uma vez só: grava-se o hash e o status vira
// ATIVO numa troca condicional (duas consultas simultâneas não levam dois tokens).
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { gerarTokenForte } from "@/lib/token";
import { hashToken } from "@/lib/ia-engenharia";

export const runtime = "nodejs";
const schema = z.object({ espera: z.string().min(30).max(200) });
const semCache = { headers: { "cache-control": "no-store" } };

export async function POST(req) {
  let body;
  try { body = schema.parse(await req.json()); } catch { return NextResponse.json({ error: "Dados inválidos" }, { status: 400 }); }
  const ap = await prisma.iaAparelho.findUnique({ where: { esperaHash: hashToken(body.espera) } });
  if (!ap) return NextResponse.json({ error: "Pareamento não encontrado." }, { status: 404 });

  if (ap.status === "PAREANDO" && ap.codigoExpiraEm && ap.codigoExpiraEm.getTime() < Date.now()) return NextResponse.json({ status: "EXPIRADO" }, semCache);
  if (ap.status === "APROVADO" && !ap.tokenHash) {
    const token = gerarTokenForte();
    const r = await prisma.iaAparelho.updateMany({ where: { id: ap.id, status: "APROVADO", tokenHash: null }, data: { status: "ATIVO", tokenHash: hashToken(token) } });
    if (r.count === 1) return NextResponse.json({ status: "ATIVO", token }, semCache);
    return NextResponse.json({ status: "ATIVO" }, semCache);
  }
  return NextResponse.json({ status: ap.status }, semCache);
}
