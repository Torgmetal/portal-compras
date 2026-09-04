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
import { tiposPorMarca } from "@/lib/tipo-peca";

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
    //
    // ⚠⚠ E O TIPO DA PEÇA VEM DA LISTA, não da classe do IFC. Vitor (05/09/2026): "o filtro de tipo
    // precisa dar uma verificada — quando colocamos em vigas ele seleciona algumas coisas sem
    // sentido; teria que pegar nas listas os nomes das peças". O Tekla exporta como IfcBeam quase
    // tudo que é barra (terça, tesoura, contraventamento, tirante), então "Viga" trazia meia obra.
    // A descrição do conjunto na LPC diz o que a peça é — ver lib/tipo-peca.js.
    let setores = {}, tipos = {};
    try {
      const op = await prisma.oP.findFirst({ where: { numero: portal.opNumero }, select: { id: true } });
      if (op) {
        const pecas = await prisma.pecaConjunto.findMany({
          where: { opId: op.id }, select: { marca: true, descricao: true }, take: 6000,
        });
        const marcas = pecas.map((p) => p.marca).filter(Boolean);
        const mapa = await setorDasMarcas([...new Set(marcas)]);
        setores = Object.fromEntries(mapa);
        tipos = tiposPorMarca(pecas);
      }
    } catch { /* sem apontamento o filtro simplesmente não aparece */ }

    return NextResponse.json({
      achou: !!r.achou,
      niveis: (r.niveis || []).map((n) => ({ rotulo: n.rotulo, mm: n.mm, marcas: n.marcas })),
      setores,
      tipos,
    });
  } catch {
    return NextResponse.json({ achou: false, niveis: [], setores: {}, tipos: {} });
  }
}
