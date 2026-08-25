// GET  /api/diretoria/fluxo/pasta?opId=…  → a última conferência gravada
// POST /api/diretoria/fluxo/pasta {opId}  → confere agora e grava
//
// Vitor (25/08/2026): "o sentido de puxar das pastas deve manter". O painel media lista importada e
// chamava isso de desenho entregue; agora olha o que existe de fato no SharePoint.
//
// ⚠ A CONTA MORA NA LIB, não aqui: o cron precisa exatamente da mesma conferência. Duas cópias
// divergiriam no primeiro ajuste de critério, e o painel passaria a discordar de si mesmo conforme
// o número tivesse vindo do botão ou da madrugada.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDiretoria } from "@/lib/diretoria";
import { conferirPastaDaOp, formatarSalvo } from "@/lib/pasta-engenharia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function autorizar() {
  try { await requireDiretoria(); return null; }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
}

export async function GET(req) {
  const nao = await autorizar(); if (nao) return nao;
  const opId = new URL(req.url).searchParams.get("opId");
  if (!opId) return NextResponse.json({ error: "Informe a OP." }, { status: 400 });
  const salvo = await prisma.pastaEngenharia.findUnique({ where: { opId } });
  return NextResponse.json(formatarSalvo(salvo) || { veredito: null });
}

export async function POST(req) {
  const nao = await autorizar(); if (nao) return nao;
  const { opId } = await req.json().catch(() => ({}));
  if (!opId) return NextResponse.json({ error: "Informe a OP." }, { status: 400 });
  try {
    const r = await conferirPastaDaOp(prisma, opId);
    return NextResponse.json({ ...r, checadoEm: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Falha ao conferir a pasta." }, { status: 500 });
  }
}
