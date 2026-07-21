// GET/POST /api/comercial/op/[id]/atas
// Atas de reunião POR OP (aba Planejamento). GET lista; POST cria a próxima
// (numeração sequencial por OP: #01, #02…).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
const ROLES = ["ADMIN", "COMERCIAL", "PLANEJAMENTO", "PCP"];

export async function GET(_req, { params }) {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const op = await prisma.oP.findUnique({ where: { id: params.id }, select: { id: true, obra: true, cliente: true, refCliente: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });
  const atas = await prisma.ataOP.findMany({ where: { opId: op.id }, orderBy: { numero: "desc" } });
  return NextResponse.json({ success: true, atas, op: { obra: op.obra, cliente: op.cliente, refCliente: op.refCliente } });
}

export async function POST(req, { params }) {
  let user;
  try { user = await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const op = await prisma.oP.findUnique({ where: { id: params.id }, select: { id: true, numero: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });
  let body = {};
  try { body = await req.json(); } catch { /* corpo opcional */ }

  const ultima = await prisma.ataOP.findFirst({ where: { opId: op.id }, orderBy: { numero: "desc" }, select: { numero: true } });
  const numero = (ultima?.numero || 0) + 1;

  const ata = await prisma.ataOP.create({
    data: {
      opId: op.id, opNumero: op.numero, numero,
      titulo: String(body.titulo || `Ata de reunião #${String(numero).padStart(2, "0")}`).slice(0, 200),
      dataReuniao: body.dataReuniao ? new Date(body.dataReuniao) : new Date(),
      criadoPorId: user.id,
    },
  });
  return NextResponse.json({ success: true, ata });
}
