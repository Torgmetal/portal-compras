// /api/relatorios
//   GET  → lista os relatórios (resumo, sem as fotos).
//   POST { titulo, opId?, opNumero?, cliente?, obra? } → cria um relatório vazio.
// Acesso: Comercial/Produção/Engenharia/PCP/Qualidade (+ ADMIN).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { MODS_RELATORIOS } from "@/lib/relatorios";
import { z } from "zod";

export const runtime = "nodejs";

const createSchema = z.object({
  titulo: z.string().trim().min(2, "Informe um título").max(200),
  opId: z.string().optional().nullable(),
  opNumero: z.string().optional().nullable(),
  cliente: z.string().optional().nullable(),
  obra: z.string().optional().nullable(),
});

export async function GET() {
  try { await requireRole(MODS_RELATORIOS); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const rows = await prisma.relatorioStatus.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
    select: { id: true, titulo: true, cliente: true, obra: true, opNumero: true, status: true, criadoPorNome: true, createdAt: true, updatedAt: true, blocos: true },
  });
  const relatorios = rows.map((r) => {
    const blocos = Array.isArray(r.blocos) ? r.blocos : [];
    const nFotos = blocos.reduce((a, b) => a + (Array.isArray(b?.fotos) ? b.fotos.length : 0), 0);
    const { blocos: _omit, ...rest } = r;
    return { ...rest, nBlocos: blocos.length, nFotos };
  });
  return NextResponse.json({ success: true, relatorios });
}

export async function POST(req) {
  let user;
  try { user = await requireRole(MODS_RELATORIOS); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Body inválido" }, { status: 400 }); }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message }, { status: 400 });
  const d = parsed.data;

  const rel = await prisma.relatorioStatus.create({
    data: {
      titulo: d.titulo, opId: d.opId || null, opNumero: d.opNumero || null,
      cliente: d.cliente || null, obra: d.obra || null, blocos: [],
      criadoPorId: user.id, criadoPorNome: user.name || null,
    },
    select: { id: true },
  });
  await prisma.auditLog.create({
    data: { userId: user.id, action: "CRIAR_RELATORIO_STATUS", entity: "RelatorioStatus", entityId: rel.id, diff: { titulo: d.titulo, opNumero: d.opNumero } },
  }).catch(() => {});

  return NextResponse.json({ success: true, id: rel.id });
}
