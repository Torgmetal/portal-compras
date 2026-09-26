import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/session';
import { prepararOpConferida } from '@/lib/lqc-op-servidor';
// ⚠⚠ 300 s PORQUE LER A ORIGEM DA LQC VARRE AS PASTAS (26/09/2026). A busca do Graph devolve
// HTTP 500 neste drive desde 22–23/09, e `lerFonteLqc` passou a varrer `ORÇAMENTOS_{ano}`: medido,
// 45 s. Não estreitei a varredura para a pasta do próprio orçamento de propósito — a garantia
// desta função é "existe UMA cópia desta planilha no servidor", e olhar só a pasta numerada
// esconderia a cópia que ficou numa pasta de data em "1. Solicitados" (a LQC-295-26 tem as duas).
// Gerar OP com a planilha errada é pior que esperar. Ver `docs/memoria-claude/torg_graph_busca_500.md`.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';
export async function GET(req, {params}) {
  try { await requireRole(['ADMIN','COMERCIAL']); }
  catch(e) {return NextResponse.json({error:e.message},{status:e.message === 'Unauthorized' ? 401 : 403});}
  const {id} = await params;
  const estudo = await prisma.estudoFabricacao.findUnique({where:{id},include:{orcamento:true}});
  if (!estudo) return NextResponse.json({error:'LQC não encontrada.'},{status:404});
  if (estudo.orcamento?.opId) return NextResponse.json({opId:estudo.orcamento.opId});
  try {return NextResponse.json(await prepararOpConferida(estudo));}
  catch(e) {return NextResponse.json({error:e.message},{status:422});}
}
