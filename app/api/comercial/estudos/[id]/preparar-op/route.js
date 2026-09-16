import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/session';
import { prepararOpDaLqc } from '@/lib/lqc-op';
export const dynamic = 'force-dynamic';
export async function GET(req, {params}) {
  try { await requireRole(['ADMIN','COMERCIAL']); }
  catch(e) {return NextResponse.json({error:e.message},{status:e.message === 'Unauthorized' ? 401 : 403});}
  const {id} = await params;
  const estudo = await prisma.estudoFabricacao.findUnique({where:{id},include:{orcamento:true}});
  if (!estudo) return NextResponse.json({error:'LQC não encontrada.'},{status:404});
  if (estudo.orcamento?.opId) return NextResponse.json({opId:estudo.orcamento.opId});
  try {return NextResponse.json(prepararOpDaLqc(estudo));}
  catch(e) {return NextResponse.json({error:e.message},{status:422});}
}
