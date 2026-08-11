// Assinatura PÚBLICA (token) de um documento (Plano de Treinamentos / Cronograma de Auditoria).
// GET → dados do documento p/ a pessoa · POST → registra a assinatura (confirmação + data + IP).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

async function carregar(token) {
  return prisma.assinaturaDocumento.findUnique({
    where: { token },
    include: { envio: { select: { tipo: true, revisao: true, titulo: true, enviadoEm: true } } },
  });
}

export async function GET(_req, { params }) {
  const a = await carregar(params.token);
  if (!a) return NextResponse.json({ error: "Link inválido ou expirado." }, { status: 404 });
  return NextResponse.json({
    nome: a.nome, setor: a.setor, assinadoEm: a.assinadoEm, ip: a.ip,
    titulo: a.envio.titulo, revisao: a.envio.revisao, tipo: a.envio.tipo, enviadoEm: a.envio.enviadoEm,
  });
}

export async function POST(req, { params }) {
  const a = await carregar(params.token);
  if (!a) return NextResponse.json({ error: "Link inválido ou expirado." }, { status: 404 });
  if (a.assinadoEm) return NextResponse.json({ ok: true, jaAssinado: true, assinadoEm: a.assinadoEm, ip: a.ip });

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || null;
  const upd = await prisma.assinaturaDocumento.update({ where: { id: a.id }, data: { assinadoEm: new Date(), ip } });
  return NextResponse.json({ ok: true, assinadoEm: upd.assinadoEm, ip: upd.ip });
}
