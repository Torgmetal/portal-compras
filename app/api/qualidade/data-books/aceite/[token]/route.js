// GET  /api/qualidade/data-books/aceite/[token]  — PÚBLICO: dados p/ a página de aceite
// POST /api/qualidade/data-books/aceite/[token]   — PÚBLICO: cliente confirma o aceite
// Acesso por token único (sem login), espelhando o padrão do aceite de Kick Off.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { montarTermoAceite } from "@/lib/databook-secoes";

export const runtime = "nodejs";

const fmtOP = (n) => (n ? `OP-${String(n).padStart(3, "0")}` : "—");

function publico(book) {
  return {
    opNumero: book.opNumero,
    op: fmtOP(book.opNumero),
    cliente: book.cliente,
    obra: book.obra,
    pesoTotalKg: book.pesoTotalKg,
    pecas: book.pecas,
    status: book.status,
    enviadoClienteEm: book.enviadoClienteEm,
    aceiteEm: book.aceiteEm,
    aceiteNome: book.aceiteNome,
    termo: montarTermoAceite(book),
  };
}

export async function GET(_req, { params }) {
  const book = await prisma.dataBookQualidade.findUnique({ where: { tokenCliente: params.token } });
  if (!book) return NextResponse.json({ success: false, error: "Link inválido ou expirado." }, { status: 404 });
  return NextResponse.json({ success: true, data: publico(book) });
}

export async function POST(req, { params }) {
  let body;
  try {
    body = z.object({ nome: z.string().min(3, "Informe seu nome completo").max(120) }).parse(await req.json());
  } catch (e) {
    return NextResponse.json({ success: false, error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 });
  }

  const book = await prisma.dataBookQualidade.findUnique({ where: { tokenCliente: params.token } });
  if (!book) return NextResponse.json({ success: false, error: "Link inválido ou expirado." }, { status: 404 });
  if (book.status === "ACEITO") {
    return NextResponse.json({ success: true, data: publico(book), jaAceito: true });
  }
  if (book.status !== "ENVIADO_CLIENTE") {
    return NextResponse.json({ success: false, error: "Este data book ainda não está disponível para aceite." }, { status: 400 });
  }

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;
  const atualizado = await prisma.dataBookQualidade.update({
    where: { id: book.id },
    data: { status: "ACEITO", aceiteEm: new Date(), aceiteNome: body.nome.trim(), aceiteIp: ip },
  });

  await prisma.auditLog
    .create({ data: { userId: book.criadoPorId || null, action: "ACEITE_CLIENTE_DATABOOK", entity: "DataBookQualidade", entityId: book.id, diff: { nome: body.nome.trim(), ip } } })
    .catch(() => {});

  return NextResponse.json({ success: true, data: publico(atualizado) });
}
