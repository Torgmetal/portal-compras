// GET  /api/qualidade/data-books  — lista os data books
// POST /api/qualidade/data-books  — cria um data book para uma OP (semeia as 20 seções)
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { montaSecoesIniciais } from "@/lib/databook-secoes";
import { secoesForaDoEscopo } from "@/lib/qualidade-escopo";

// Marca como "não se aplica" as seções que só existem para guardar relatório que esta
// obra não faz. Ver lib/qualidade-escopo.js — a lista de seções mora lá, não aqui.
function aplicarEscopo(secoes, op) {
  const fora = new Set(secoesForaDoEscopo(op));
  if (!fora.size) return secoes;
  return secoes.map((s) => (fora.has(s.numero) ? { ...s, estado: "NA" } : s));
}

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

  // ⚠ AS OPs VÃO JUNTO, para a criação ser uma ESCOLHA e não uma digitação. Vitor (28/08/2026):
  // "na criação do data book preciso que deixe a listagem de OPs". Digitar "083" à mão é como se
  // cria data book na obra errada — e o dossiê nasce com cliente e peso de outra.
  const jaTem = new Set(books.map((b) => b.opNumero));
  const ops = await prisma.oP.findMany({
    where: { status: { not: "CANCELADA" } },
    select: { numero: true, cliente: true, obra: true, status: true, tipoDataBook: true },
    orderBy: { numero: "desc" },
    take: 400,
  });
  return NextResponse.json({
    success: true,
    data,
    ops: ops.map((o) => ({ ...o, temDataBook: jaTem.has(o.numero) })),
  });
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
      id: true, cliente: true, obra: true, tipoDataBook: true, escopoQualidade: true,
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
      tipo: op.tipoDataBook || null,
      pesoTotalKg,
      pecas,
      criadoPorId: user.id,
      // ⚠ SEÇÃO FORA DO ESCOPO NASCE "N/A". Se a obra só faz certificado e pintura, a
      // §11 (dimensional) e a §12 (END) não são pendências — elas não existem nessa
      // obra. Deixá-las PENDENTE faria o data book cobrar para sempre um relatório que
      // ninguém vai fazer. Continua editável: é um ponto de partida, não uma trava.
      secoes: { create: aplicarEscopo(montaSecoesIniciais(), op) },
    },
  });

  await prisma.auditLog
    .create({ data: { userId: user.id, action: "CRIAR_DATABOOK_QUALIDADE", entity: "DataBookQualidade", entityId: book.id, diff: { opNumero } } })
    .catch(() => {});

  return NextResponse.json({ success: true, id: book.id }, { status: 201 });
}
