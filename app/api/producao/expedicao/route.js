import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
const entrada = z.object({
  opId: z.string().min(1).max(100),
  pagina: z.coerce.number().int().min(1).max(10000).default(1),
});
export async function GET(req) {
  try {
    await requireRole([
      "ADMIN",
      "PRODUCAO",
      "PCP",
      "PLANEJAMENTO",
      "EXPEDICAO",
    ]);
  } catch (e) {
    return NextResponse.json(
      { error: e.message },
      { status: e.message === "Unauthorized" ? 401 : 403 },
    );
  }
  const parsed = entrada.safeParse(
    Object.fromEntries(new URL(req.url).searchParams),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  try {
    const { opId, pagina } = parsed.data;
    const where = { opId };
    const [romaneios, total] = await Promise.all([
      prisma.romaneio.findMany({
        where,
        orderBy: [{ data: "desc" }, { id: "asc" }],
        take: 20,
        skip: (pagina - 1) * 20,
        select: {
          id: true,
          numero: true,
          data: true,
          pesoRealKg: true,
          destino: true,
          nfStatus: true,
          nfNumero: true,
          itens: {
            select: {
              id: true,
              descricao: true,
              qtd: true,
              pecaConjunto: { select: { marca: true } },
            },
          },
        },
      }),
      prisma.romaneio.count({ where }),
    ]);
    return NextResponse.json(
      { romaneios, total, pagina, paginas: Math.max(1, Math.ceil(total / 20)) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Não foi possível consultar os romaneios." },
      { status: 500 },
    );
  }
}
