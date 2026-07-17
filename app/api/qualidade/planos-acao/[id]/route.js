// Detalhe / edição de um plano de ação 5W2H.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

export const runtime = "nodejs";

export async function GET(_req, { params }) {
  try { await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const p = await prisma.planoAcao.findUnique({ where: { id: params.id } });
  if (!p) return NextResponse.json({ error: "Plano não encontrado" }, { status: 404 });
  return NextResponse.json({ plano: p });
}

const itemSchema = z.object({
  oque: z.string().max(1000).optional().nullable(),
  porque: z.string().max(1000).optional().nullable(),
  onde: z.string().max(300).optional().nullable(),
  quem: z.string().max(150).optional().nullable(),
  quando: z.string().optional().nullable(),
  como: z.string().max(1000).optional().nullable(),
  quanto: z.string().max(120).optional().nullable(),
  status: z.enum(["A_FAZER", "EM_ANDAMENTO", "CONCLUIDO"]).optional(),
  acompanhamento: z.string().max(2000).optional().nullable(),
});

const schema = z.object({
  titulo: z.string().min(1).max(200).optional(),
  origem: z.string().max(200).optional().nullable(),
  responsavel: z.string().max(120).optional().nullable(),
  status: z.enum(["EM_ANDAMENTO", "CONCLUIDO", "CANCELADO"]).optional(),
  itens: z.array(itemSchema).optional(),
});

export async function PATCH(req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const atual = await prisma.planoAcao.findUnique({ where: { id: params.id }, select: { id: true, itens: true } });
  if (!atual) return NextResponse.json({ error: "Plano não encontrado" }, { status: 404 });

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const data = {};
  if (body.titulo !== undefined) data.titulo = body.titulo.trim();
  if (body.origem !== undefined) data.origem = body.origem?.trim() || null;
  if (body.responsavel !== undefined) data.responsavel = body.responsavel?.trim() || null;
  if (body.status !== undefined) data.status = body.status;
  if (body.itens !== undefined) {
    const anteriores = Array.isArray(atual.itens) ? atual.itens : [];
    data.itens = body.itens
      .filter((i) => (i.oque || "").trim())
      .map((i, idx) => {
        const st = i.status || "A_FAZER";
        const antes = anteriores[idx];
        // carimba concluidoEm na transição p/ CONCLUIDO; limpa se sair
        let concluidoEm = antes?.concluidoEm || null;
        if (st === "CONCLUIDO" && antes?.status !== "CONCLUIDO") concluidoEm = new Date().toISOString();
        if (st !== "CONCLUIDO") concluidoEm = null;
        return {
          oque: (i.oque || "").trim(), porque: (i.porque || "").trim(), onde: (i.onde || "").trim(),
          quem: (i.quem || "").trim(), quando: i.quando || null, como: (i.como || "").trim(),
          quanto: (i.quanto || "").trim(), status: st, acompanhamento: (i.acompanhamento || "").trim(), concluidoEm,
        };
      });
  }

  await prisma.planoAcao.update({ where: { id: atual.id }, data });
  return NextResponse.json({ success: true });
}

export async function DELETE(_req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  await prisma.planoAcao.delete({ where: { id: params.id } });
  await prisma.auditLog.create({ data: { userId: user.id, action: "EXCLUIR_PLANO_ACAO", entity: "PlanoAcao", entityId: params.id, diff: {} } }).catch(() => {});
  return NextResponse.json({ success: true });
}
