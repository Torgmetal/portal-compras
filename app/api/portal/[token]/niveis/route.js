// GET /api/portal/[token]/niveis → os níveis de montagem da obra, para o filtro do modelo 3D
//
// ⚠ mesma leitura do portal interno (lib/niveis-montagem), mas só o que o filtro precisa: rótulo,
// cota e as marcas. Peso e consumíveis ficam de fora — o cliente já recebe a LE com os pesos, e a
// lista de parafusos de montagem é documento de obra, não de filtro de tela.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { niveisDaMontagem } from "@/lib/niveis-montagem";
import { secoesDoPortal } from "@/lib/portal-cliente";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req, { params }) {
  const { token } = await params;
  const portal = await prisma.portalCliente.findUnique({ where: { token } });
  if (!portal || portal.status !== "PUBLICADO") return NextResponse.json({ achou: false, niveis: [] }, { status: 404 });
  if (!secoesDoPortal(portal).includes("MODELO_NAVEGAVEL")) return NextResponse.json({ achou: false, niveis: [] }, { status: 403 });

  try {
    const r = await niveisDaMontagem(portal.opNumero);
    return NextResponse.json({
      achou: !!r.achou,
      niveis: (r.niveis || []).map((n) => ({ rotulo: n.rotulo, mm: n.mm, marcas: n.marcas })),
    });
  } catch {
    return NextResponse.json({ achou: false, niveis: [] });
  }
}
