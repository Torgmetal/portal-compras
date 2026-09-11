import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";
const filtros = z.object({
  q: z.string().trim().max(200).default(""),
  ano: z.coerce.number().int().min(2000).max(2099).optional(),
  pagina: z.coerce.number().int().min(1).max(10000).default(1),
});
export async function GET(req) {
  try { await requireRole(["ADMIN", "PLANEJAMENTO", "PCP"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const parsed = filtros.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const { q, ano, pagina } = parsed.data;
  const where = {
    categoria: "MATERIAL", importRef: ano ? { startsWith: String(ano).slice(-2) } : { not: null },
    NOT: { nome: { in: ["", "(sem descrição)"] } },
    ...(q ? { OR: ["importRef", "nome", "opNumero", "numeroCorrida", "numeroDocumento", "nfNumero", "fornecedor"].map((campo) => ({ [campo]: { contains: q, mode: "insensitive" } })) } : {}),
  };
  try {
    const [itens, total, ops] = await Promise.all([
      prisma.documentoQualidade.findMany({ where, orderBy: [{ importRef: "desc" }, { id: "asc" }], skip: (pagina - 1) * 50, take: 50,
        select: { id: true, importRef: true, nome: true, norma: true, opNumero: true, numeroCorrida: true, numeroDocumento: true, nfNumero: true, fornecedor: true, quantidade: true, pesoKg: true, dataRecebimento: true, arquivoUrl: true } }),
      prisma.documentoQualidade.count({ where }),
      prisma.oP.findMany({ where: { status: { notIn: ["ENCERRADA", "CANCELADA"] } }, select: { id: true, numero: true, obra: true }, orderBy: { numero: "desc" } }),
    ]);
    return NextResponse.json({ itens, total, pagina, paginas: Math.ceil(total / 50), ops });
  } catch { return NextResponse.json({ error: "Não foi possível consultar os recebimentos." }, { status: 500 }); }
}
