// Ajustes por marca do simulador de carga, por OP.
// GET  → { ajustes: { MARCA: regras } }
// PUT  { marca, regras } → grava (regras vazias apagam o ajuste)
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { normalizarRegras } from "@/lib/carga/ajustes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ROLES = ["ADMIN", "COMERCIAL", "PLANEJAMENTO", "PCP", "ENGENHARIA", "EXPEDICAO"];
const negar = (e) => NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });

const mapa = (linhas) => Object.fromEntries(linhas.map((l) => [l.marca, l.regras]));

export async function GET(_req, { params }) {
  try { await requireRole(ROLES); } catch (e) { return negar(e); }
  const { id } = await params;
  const linhas = await prisma.ajusteCargaMarca.findMany({ where: { opId: id }, orderBy: { marca: "asc" } }).catch(() => []);
  return NextResponse.json({ success: true, ajustes: mapa(linhas) });
}

const schema = z.object({ marca: z.string().min(1).max(60), regras: z.record(z.string(), z.any()).nullable() });

export async function PUT(req, { params }) {
  let user;
  try { user = await requireRole(ROLES); } catch (e) { return negar(e); }
  const { id } = await params;
  let body;
  try { body = schema.parse(await req.json()); } catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }
  const op = await prisma.oP.findUnique({ where: { id }, select: { id: true, numero: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });
  const marca = body.marca.trim().toUpperCase();
  let regras;
  try { regras = normalizarRegras(body.regras || {}); } catch (e) { return NextResponse.json({ error: e.message }, { status: 400 }); }
  const antes = await prisma.ajusteCargaMarca.findUnique({ where: { opId_marca: { opId: op.id, marca } } }).catch(() => null);
  if (!regras) { if (antes) await prisma.ajusteCargaMarca.delete({ where: { id: antes.id } }); }
  else await prisma.ajusteCargaMarca.upsert({ where: { opId_marca: { opId: op.id, marca } }, create: { opId: op.id, marca, regras, atualizadoPorId: user.id }, update: { regras, atualizadoPorId: user.id, updatedAt: new Date() } });
  await prisma.auditLog.create({ data: { userId: user.id, action: "AJUSTE_CARGA_MARCA", entity: "AjusteCargaMarca", entityId: `${op.numero}|${marca}`, diff: { antes: antes?.regras || null, depois: regras } } }).catch(() => {});
  const linhas = await prisma.ajusteCargaMarca.findMany({ where: { opId: op.id }, orderBy: { marca: "asc" } });
  return NextResponse.json({ success: true, ajustes: mapa(linhas) });
}
