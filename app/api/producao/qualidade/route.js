import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
const Consulta = z.object({ opId: z.string().min(1).max(100), resultado: z.enum(["TODOS", "APROVADO", "REPROVADO", "REC", "PENDENTE"]).default("TODOS"), pagina: z.coerce.number().int().min(1).max(10000).default(1) });
/** Visão operacional somente leitura. Não inclui assinaturas, anexos privados ou edição. */
export async function GET(req) {
  try { await requireRole(["ADMIN", "PRODUCAO", "PCP", "PLANEJAMENTO", "QUALIDADE"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const validacao = Consulta.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!validacao.success) return NextResponse.json({ error: validacao.error.issues[0]?.message || "Consulta inválida." }, { status: 400 });
  const { opId, resultado, pagina } = validacao.data;
  try {
    const op = await prisma.oP.findUnique({ where: { id: opId }, select: { id: true, numero: true } });
    if (!op) return NextResponse.json({ error: "OP não encontrada." }, { status: 404 });
    const where = { OR: [{ opId }, { opId: null, opNumero: op.numero }], ...(resultado === "TODOS" ? {} : { resultadoInspecao: resultado === "PENDENTE" ? null : resultado }) };
    const [relatorios, total] = await Promise.all([
      prisma.relatorioInspecao.findMany({ where, select: { id: true, codigo: true, opNumero: true, tipo: true, status: true, resultadoInspecao: true, revisao: true, marcas: true, emitidoEm: true, updatedAt: true }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: 30, skip: (pagina - 1) * 30 }),
      prisma.relatorioInspecao.count({ where }),
    ]);
    return NextResponse.json({ relatorios, total, pagina, paginas: Math.max(1, Math.ceil(total / 30)) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "Não foi possível consultar os relatórios. Tente novamente." }, { status: 500 }); }
}
