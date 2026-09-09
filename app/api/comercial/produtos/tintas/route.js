import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/session';
import { fornecedorAtende } from '@/lib/cotacao-familias';
import { historicoBoletim } from '@/lib/boletim-historico';
import { urlBoletimSegura } from '@/lib/cotacao-tinta-snapshot';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const ROLES=['ADMIN','COMERCIAL','QUALIDADE','COMPRAS'];
async function usuario(){return requireRole(ROLES);}
const authError=e=>NextResponse.json({error:e.message},{status:e.message==='Unauthorized'?401:403});
export async function GET(){
  try{await usuario();}catch(e){return authError(e);}
  const [tintas,lista]=await Promise.all([
    prisma.produtoTinta.findMany({orderBy:[{fabricante:'asc'},{produto:'asc'}]}),
    prisma.fornecedor.findMany({where:{ativo:true},select:{id:true,razaoSocial:true,nomeFantasia:true,email:true,categorias:true,fabricanteTinta:true},orderBy:{razaoSocial:'asc'}}),
  ]);
  return NextResponse.json({tintas,fornecedores:lista.filter(f=>fornecedorAtende(f,'TINTA')).map(f=>({...f,nome:f.nomeFantasia||f.razaoSocial}))});
}
const Texto=z.string().trim().max(300).nullable().optional();
const Produto=z.object({id:z.string().optional(),fabricante:z.string().trim().min(1).max(80),produto:z.string().trim().min(1).max(160),
  categoria:z.enum(['TINTA','DILUENTE','ENDURECEDOR']),tipo:z.enum(['PRIMER','INTERMEDIARIA','ACABAMENTO','UNICA']).nullable().optional(),
  boletimUrl:z.string().url(),boletimNome:z.string().trim().min(1).max(200),boletimRevisao:z.string().trim().min(1).max(80),
  boletimData:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),conferido:z.literal(true),
  solidosVol:z.number().positive().max(100).nullable(),secaMin:z.number().positive().max(10000).nullable(),secaMax:z.number().positive().max(10000).nullable(),
  componenteA:Texto,componenteB:Texto,proporcaoMistura:Texto,diluente:Texto,especificacao:Texto,norma:Texto,
  diluicaoMin:z.number().min(0).max(100).nullable().optional(),diluicaoMax:z.number().min(0).max(100).nullable().optional(),
  observacoes:z.string().trim().max(2000).nullable().optional(),ativo:z.boolean().default(true),
});
export async function POST(req){
  let user;try{user=await usuario();}catch(e){return authError(e);}
  let b;try{b=Produto.parse(await req.json());}catch(e){return NextResponse.json({error:e.issues?.[0]?.message||'Confira os dados obrigatórios.'},{status:400});}
  if(!urlBoletimSegura(b.boletimUrl)||!b.boletimNome.toLowerCase().endsWith('.pdf'))return NextResponse.json({error:'Anexe um boletim PDF com URL HTTPS.'},{status:400});
  if(b.categoria==='TINTA'&&(!b.tipo||!b.solidosVol||!b.secaMin||!b.secaMax||b.secaMax<b.secaMin))return NextResponse.json({error:'Confira tipo da demão, sólidos e faixa de película seca.'},{status:400});
  // Revisões do mesmo produto pertencem ao registro original e ao seu histórico.
  b.fabricante=b.fabricante.normalize('NFKC');b.produto=b.produto.normalize('NFKC');
  const duplicado=await prisma.produtoTinta.findFirst({where:{fabricante:{equals:b.fabricante,mode:'insensitive'},produto:{equals:b.produto,mode:'insensitive'},...(b.id?{id:{not:b.id}}:{})},select:{id:true}});
  if(duplicado)return NextResponse.json({error:'Este produto já está cadastrado para o fabricante. Abra “Conferir / nova revisão” no registro existente.',produtoId:duplicado.id},{status:409});
  const atual=b.id?await prisma.produtoTinta.findUnique({where:{id:b.id}}):null;
  if(b.id&&!atual)return NextResponse.json({error:'Produto não encontrado.'},{status:404});
  const {id,conferido,...dados}=b;
  const data={...dados,conferidoEm:new Date(),conferidoPorNome:user.name||user.email||user.id,
    historicoBoletins:historicoBoletim(atual), ...(atual?.fabricante!==dados.fabricante?{diluenteId:null}:{})};
  const tinta=atual?await prisma.produtoTinta.update({where:{id},data}):await prisma.produtoTinta.create({data:{...data,criadoPorId:user.id,criadoPorNome:user.name||user.email||null}});
  await prisma.auditLog.create({data:{userId:user.id,action:'BOLETIM_TINTA_CONFERIDO',entity:'ProdutoTinta',entityId:tinta.id,diff:{fabricante:tinta.fabricante,revisao:tinta.boletimRevisao,anterior:atual?.boletimRevisao||null}}}).catch(()=>{});
  return NextResponse.json({ok:true,tinta});
}
export async function PUT(req){
  let user;try{user=await usuario();}catch(e){return authError(e);}
  let b;try{b=z.object({fornecedorId:z.string().min(1),fabricanteTinta:z.string().trim().max(80).nullable()}).parse(await req.json());}catch{return NextResponse.json({error:'Informe fornecedor e fabricante.'},{status:400});}
  const f=await prisma.fornecedor.findUnique({where:{id:b.fornecedorId}});
  if(!f?.ativo||!fornecedorAtende(f,'TINTA'))return NextResponse.json({error:'Fornecedor de tintas não encontrado.'},{status:404});
  const fabricante=b.fabricanteTinta||null;
  await prisma.fornecedor.update({where:{id:f.id},data:{fabricanteTinta:fabricante}});
  await prisma.auditLog.create({data:{userId:user.id,action:'FORNECEDOR_FABRICANTE_TINTA',entity:'Fornecedor',entityId:f.id,diff:{antes:f.fabricanteTinta,depois:fabricante}}}).catch(()=>{});
  return NextResponse.json({ok:true});
}
