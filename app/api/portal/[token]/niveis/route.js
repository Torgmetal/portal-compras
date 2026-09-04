// GET /api/portal/[token]/niveis → os níveis de montagem da obra, para o filtro do modelo 3D
//
// ⚠ mesma leitura do portal interno (lib/niveis-montagem), mas só o que o filtro precisa: rótulo,
// cota e as marcas. Peso e consumíveis ficam de fora — o cliente já recebe a LE com os pesos, e a
// lista de parafusos de montagem é documento de obra, não de filtro de tela.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { niveisDaMontagem } from "@/lib/niveis-montagem";
import { secoesDoPortal, portalExpirado } from "@/lib/portal-cliente";
import { setorDasMarcas } from "@/lib/portal-obra-consulta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req, { params }) {
  const { token } = await params;
  const portal = await prisma.portalCliente.findUnique({ where: { token } });
  if (!portal || portal.status !== "PUBLICADO" || portalExpirado(portal)) return NextResponse.json({ achou: false, niveis: [] }, { status: 404 });
  if (!secoesDoPortal(portal).includes("MODELO_NAVEGAVEL")) return NextResponse.json({ achou: false, niveis: [] }, { status: 403 });

  try {
    const r = await niveisDaMontagem(portal.opNumero);
    // ⚠⚠ O SETOR DE CADA MARCA, para o filtro por etapa de fabricação. Vitor (04/09/2026): "quero
    // que o cliente clique no status e só apareçam as peças que estão sendo apontadas naquele
    // setor". É a MESMA leitura do painel da peça (`setorDasMarcas`, lib/portal-obra-consulta):
    // vem do apontamento do Syneco, não de status gravado — duas fontes dariam duas respostas para
    // a mesma peça, uma no filtro e outra ao clicar nela.
    let setores = {};
    try {
      const op = await prisma.oP.findFirst({ where: { numero: portal.opNumero }, select: { id: true } });
      if (op) {
        const marcas = (await prisma.pecaConjunto.findMany({
          where: { opId: op.id }, select: { marca: true }, take: 6000,
        })).map((p) => p.marca).filter(Boolean);
        const mapa = await setorDasMarcas([...new Set(marcas)]);
        setores = Object.fromEntries(mapa);
      }
    } catch { /* sem apontamento o filtro simplesmente não aparece */ }

    return NextResponse.json({
      achou: !!r.achou,
      niveis: (r.niveis || []).map((n) => ({ rotulo: n.rotulo, mm: n.mm, marcas: n.marcas })),
      setores,
    });
  } catch {
    return NextResponse.json({ achou: false, niveis: [], setores: {} });
  }
}
