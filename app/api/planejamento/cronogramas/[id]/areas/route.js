// POST /api/planejamento/cronogramas/[id]/areas — gerencia as Áreas do cronograma.
//  { acao: "renomear", de, para } → renomeia a área MANTENDO a cor + atualiza as tarefas
//  { acao: "definir", nomes: [...] } → (re)define a lista de áreas (cores por ordem)
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { renomearArea, definirAreas, recolorArea, sincronizarAreas } from "@/lib/cronograma-areas";

export const runtime = "nodejs";

const schema = z.object({
  acao: z.enum(["renomear", "definir", "recolor", "sincronizar"]),
  de: z.string().max(120).optional(),
  para: z.string().max(120).optional(),
  nomes: z.array(z.string().max(120)).optional(),
  nome: z.string().max(120).optional(),
  cor: z.number().int().min(0).max(9).optional(),
});

export async function POST(req, { params }) {
  try { await requireRole(["ADMIN", "PLANEJAMENTO", "PRODUCAO", "COMERCIAL"]); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { id } = await params;
  const crono = await prisma.cronograma.findUnique({ where: { id }, select: { id: true } });
  if (!crono) return NextResponse.json({ success: false, error: "Cronograma não encontrado" }, { status: 404 });

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ success: false, error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  if (body.acao === "renomear") {
    if (!body.de?.trim() || !body.para?.trim()) return NextResponse.json({ success: false, error: "Informe 'de' e 'para'." }, { status: 400 });
    const r = await renomearArea(prisma, id, body.de, body.para);
    return NextResponse.json({ success: true, ...r });
  }
  if (body.acao === "recolor") {
    if (!body.nome?.trim() || body.cor == null) return NextResponse.json({ success: false, error: "Informe 'nome' e 'cor'." }, { status: 400 });
    const areas = await recolorArea(prisma, id, body.nome, body.cor);
    return NextResponse.json({ success: true, areas });
  }
  if (body.acao === "sincronizar") {
    const r = await sincronizarAreas(prisma, id);
    return NextResponse.json({ success: true, ...r });
  }
  // definir
  const areas = await definirAreas(prisma, id, body.nomes || []);
  return NextResponse.json({ success: true, areas });
}
