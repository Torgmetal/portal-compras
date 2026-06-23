// POST /api/planejamento/status-obra/importar  body { op }
// Baixa do SharePoint a Lista Avançada Expedição da OP (todas as frentes, a mais
// recente de cada) e faz upsert em ListaExpedicao.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { importarListasOP } from "@/lib/lista-avancada-sharepoint";

export const runtime = "nodejs";
export const maxDuration = 120;

const schema = z.object({ op: z.string().min(1).max(12) });

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "PLANEJAMENTO", "ENGENHARIA", "EXPEDICAO"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const opNumero = body.op.replace(/\D/g, "");
  if (!opNumero) return NextResponse.json({ error: "OP inválida" }, { status: 400 });

  // resolve opId se a OP existir no portal
  const op = await prisma.oP.findFirst({ where: { numero: { in: [opNumero, opNumero.padStart(3, "0")] } }, select: { id: true } });

  let res;
  try {
    res = await importarListasOP({ opNumero, opId: op?.id || null, userId: user.id });
  } catch (e) {
    return NextResponse.json({ error: "Erro ao importar do SharePoint: " + (e?.message || "") }, { status: 502 });
  }
  if (!res.ok) return NextResponse.json({ error: res.erro }, { status: 404 });

  await prisma.auditLog.create({
    data: { userId: user.id, action: "IMPORTAR_LISTA_EXPEDICAO", entity: "ListaExpedicao", entityId: opNumero, diff: { frentes: res.resultados?.map((r) => ({ frente: r.frente, ok: r.ok, marcas: r.marcas })) } },
  }).catch(() => {});

  return NextResponse.json({ success: true, ...res });
}
