// GET  /api/relatorio/aceite/[token] — PÚBLICO: dados p/ a página de aceite.
// POST /api/relatorio/aceite/[token] — PÚBLICO: cliente confirma o recebimento.
// Acesso por token único (sem login), espelhando o aceite do Data Book.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const fmtOP = (n) => { if (!n) return null; const s = String(n).trim(); return /^\d+$/.test(s) ? `OP-${s.padStart(3, "0")}` : `OP ${s}`; };

function publico(rel) {
  const blocos = Array.isArray(rel.blocos) ? rel.blocos : [];
  return {
    titulo: rel.titulo, cliente: rel.cliente, obra: rel.obra, op: fmtOP(rel.opNumero),
    resumo: rel.resumo,
    nBlocos: blocos.length,
    nFotos: blocos.reduce((a, b) => a + (Array.isArray(b?.fotos) ? b.fotos.length : 0), 0),
    aceitoEm: rel.aceitoEm, aceitoNome: rel.aceitoNome,
  };
}

export async function GET(_req, { params }) {
  const rel = await prisma.relatorioStatus.findUnique({ where: { token: params.token } });
  if (!rel) return NextResponse.json({ success: false, error: "Link inválido ou expirado." }, { status: 404 });
  return NextResponse.json({ success: true, data: publico(rel) });
}

export async function POST(req, { params }) {
  let body;
  try {
    body = z.object({ nome: z.string().trim().min(3, "Informe seu nome completo").max(120), cargo: z.string().max(120).optional() }).parse(await req.json());
  } catch (e) {
    return NextResponse.json({ success: false, error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 });
  }

  const rel = await prisma.relatorioStatus.findUnique({ where: { token: params.token } });
  if (!rel) return NextResponse.json({ success: false, error: "Link inválido ou expirado." }, { status: 404 });
  if (rel.aceitoEm) return NextResponse.json({ success: true, data: publico(rel), jaAceito: true });

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;
  const nome = body.cargo ? `${body.nome.trim()} — ${body.cargo.trim()}` : body.nome.trim();
  const atualizado = await prisma.relatorioStatus.update({
    where: { id: rel.id },
    data: { aceitoEm: new Date(), aceitoNome: nome, aceitoIp: ip },
  });
  await prisma.auditLog.create({
    data: { userId: rel.criadoPorId || null, action: "ACEITE_CLIENTE_RELATORIO", entity: "RelatorioStatus", entityId: rel.id, diff: { nome, ip } },
  }).catch(() => {});

  return NextResponse.json({ success: true, data: publico(atualizado) });
}
