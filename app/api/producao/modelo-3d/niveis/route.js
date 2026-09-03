// GET /api/producao/modelo-3d/niveis?opId=… → os níveis de montagem da obra, com as marcas de cada
//
// ⚠ Rota separada do modelo de propósito: são 14 planilhas no SharePoint e alguns segundos de
// leitura. Junto do download do IFC, atrasaria a única coisa que a tela precisa para desenhar.
// Assim o modelo abre e os níveis chegam depois, sem travar nada.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { niveisDaMontagem } from "@/lib/niveis-montagem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROLES = ["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO", "ENGENHARIA", "QUALIDADE", "COMERCIAL"];

export async function GET(req) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const opId = new URL(req.url).searchParams.get("opId");
  if (!opId) return NextResponse.json({ error: "Informe a OP." }, { status: 400 });

  const op = await prisma.oP.findUnique({ where: { id: opId }, select: { numero: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada." }, { status: 404 });

  try {
    const r = await niveisDaMontagem(op.numero);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ achou: false, niveis: [], erro: String(e?.message || e).slice(0, 200) });
  }
}
