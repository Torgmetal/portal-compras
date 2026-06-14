// GET  /api/qualidade/data-books  — lista os data books
// POST /api/qualidade/data-books  — cria um data book para uma OP (semeia as 20 seções)
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { montaSecoesIniciais } from "@/lib/databook-secoes";

export const runtime = "nodejs";

const schema = z.object({ opNumero: z.string().min(1, "Informe a OP") });

export async function GET() {
  try {
    await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  const books = await prisma.dataBookQualidade.findMany({
    orderBy: { createdAt: "desc" },
    include: { secoes: { select: { estado: true } } },
  });

  const data = books.map((b) => {
    const total = b.secoes.length || 20;
    const na = b.secoes.filter((s) => s.estado === "NA").length;
    const anexadas = b.secoes.filter((s) => s.estado === "ANEXADO").length;
    const obrigatorias = total - na;
    const pendentes = obrigatorias - anexadas;
    return {
      id: b.id,
      opNumero: b.opNumero,
      cliente: b.cliente,
      obra: b.obra,
      pesoTotalKg: b.pesoTotalKg,
      pecas: b.pecas,
      status: b.status,
      emitidoEm: b.emitidoEm,
      createdAt: b.createdAt,
      progresso: obrigatorias > 0 ? Math.round((anexadas / obrigatorias) * 100) : 0,
      pendentes,
      obrigatorias,
    };
  });

  return NextResponse.json({ success: true, data });
}

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ success: false, error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 });
  }

  const opNumero = body.opNumero.trim();
  const existente = await prisma.dataBookQualidade.findUnique({ where: { opNumero } });
  if (existente) {
    return NextResponse.json({ success: true, id: existente.id, jaExistia: true });
  }

  // Dados da OP (cliente/obra) + peso/peças dos conjuntos (best-effort)
  const op = await prisma.oP.findUnique({
    where: { numero: opNumero },
    select: {
      id: true, cliente: true, obra: true,
      pecasConjunto: {
        where: { OR: [{ tipoPeca: "CONJUNTO" }, { tipoPeca: null }] },
        select: { qte: true, pesoTotalKg: true },
      },
    },
  });
  if (!op) {
    return NextResponse.json({ success: false, error: `OP ${opNumero} não encontrada` }, { status: 404 });
  }
  const pesoTotalKg = op.pecasConjunto.reduce((s, p) => s + (p.pesoTotalKg || 0), 0) || null;
  const pecas = op.pecasConjunto.reduce((s, p) => s + (p.qte || 0), 0) || null;

  const book = await prisma.dataBookQualidade.create({
    data: {
      opNumero,
      opId: op.id,
      cliente: op.cliente || null,
      obra: op.obra || null,
      pesoTotalKg,
      pecas,
      criadoPorId: user.id,
      secoes: { create: montaSecoesIniciais() },
    },
  });

  await prisma.auditLog
    .create({ data: { userId: user.id, action: "CRIAR_DATABOOK_QUALIDADE", entity: "DataBookQualidade", entityId: book.id, diff: { opNumero } } })
    .catch(() => {});

  return NextResponse.json({ success: true, id: book.id }, { status: 201 });
}
