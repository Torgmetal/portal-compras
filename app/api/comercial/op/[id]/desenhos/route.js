// GET (lista) + POST (registra um upload) — desenhos/projetos da OP (Engenharia).
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
const ROLES = ["ADMIN", "ENGENHARIA", "COMERCIAL", "PLANEJAMENTO", "PCP"];
const extDe = (nome) => (String(nome || "").match(/\.([a-z0-9]+)$/i)?.[1] || "").toLowerCase() || null;

export async function GET(_req, { params }) {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const desenhos = await prisma.desenhoOP.findMany({ where: { opId: params.id }, orderBy: [{ ordem: "asc" }, { createdAt: "asc" }], include: { lote: { select: { id: true, nome: true } } } });
  return NextResponse.json({ success: true, desenhos });
}

// loteId opcional precisa ser de um lote DESTA OP (senão vira null)
async function loteValido(loteId, opId) {
  if (!loteId) return null;
  const l = await prisma.loteExpedicao.findFirst({ where: { id: loteId, opId }, select: { id: true } });
  return l ? loteId : null;
}

const schema = z.object({
  nome: z.string().min(1).max(300),
  url: z.string().url(),
  tamanho: z.number().int().nonnegative().nullable().optional(),
  loteId: z.string().nullable().optional(),
});

export async function POST(req, { params }) {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const op = await prisma.oP.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });
  let body;
  try { body = schema.parse(await req.json()); } catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const ult = await prisma.desenhoOP.findFirst({ where: { opId: op.id }, orderBy: { ordem: "desc" }, select: { ordem: true } });
  const desenho = await prisma.desenhoOP.create({
    data: {
      opId: op.id,
      ordem: (ult?.ordem ?? 0) + 1,
      nome: body.nome.trim(),
      ext: extDe(body.nome),
      origem: "UPLOAD",
      url: body.url,
      tamanho: body.tamanho ?? null,
      loteId: await loteValido(body.loteId, op.id),
    },
  });
  return NextResponse.json({ success: true, desenho });
}
