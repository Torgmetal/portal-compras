// Planos de ação 5W2H (Qualidade). GET lista; POST cria.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { situacaoItem } from "@/lib/plano-acao";
import { z } from "zod";

export const runtime = "nodejs";

export async function GET() {
  try { await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const planos = await prisma.planoAcao.findMany({ orderBy: [{ status: "asc" }, { numero: "desc" }], take: 300 });
  const lista = planos.map((p) => {
    const itens = Array.isArray(p.itens) ? p.itens : [];
    return {
      id: p.id, numero: p.numero, titulo: p.titulo, origem: p.origem, responsavel: p.responsavel,
      status: p.status, createdAt: p.createdAt,
      total: itens.length,
      concluidos: itens.filter((i) => i.status === "CONCLUIDO").length,
      atrasados: itens.filter((i) => situacaoItem(i) === "ATRASADO").length,
    };
  });
  return NextResponse.json({ planos: lista });
}

const schema = z.object({
  titulo: z.string().min(1, "Informe o título do plano.").max(200),
  origem: z.string().max(200).optional().nullable(),
  responsavel: z.string().max(120).optional().nullable(),
});

export async function POST(req) {
  let user;
  try { user = await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const ultima = await prisma.planoAcao.findFirst({ orderBy: { numero: "desc" }, select: { numero: true } });
  const numero = (ultima?.numero || 0) + 1;

  const p = await prisma.planoAcao.create({
    data: {
      numero, titulo: body.titulo.trim(),
      origem: body.origem?.trim() || null,
      responsavel: body.responsavel?.trim() || null,
      itens: [{ oque: "", porque: "", onde: "", quem: "", quando: null, como: "", quanto: "", status: "A_FAZER", acompanhamento: "" }],
      createdById: user.id,
    },
    select: { id: true, numero: true },
  });

  await prisma.auditLog.create({ data: { userId: user.id, action: "CRIAR_PLANO_ACAO", entity: "PlanoAcao", entityId: p.id, diff: { numero, titulo: body.titulo } } }).catch(() => {});
  return NextResponse.json({ success: true, id: p.id, numero: p.numero });
}
