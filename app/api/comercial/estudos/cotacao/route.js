import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/session';
import { gerarTokenForte } from '@/lib/token';
import { sendEmail } from '@/lib/email';
import { emailCotacaoTinta } from '@/lib/cotacao-tinta-email';
import { emailCotacaoAco } from '@/lib/cotacao-aco-email';
import { FAMILIAS_COTACAO, fornecedorAtende } from '@/lib/cotacao-familias';
import { criarSnapshotTinta } from '@/lib/cotacao-tinta-snapshot';
export const runtime = 'nodejs';
export const maxDuration = 120;
const ROLES = ['ADMIN','COMERCIAL','COMPRAS'];
const fornecedorSelect = {id:true,razaoSocial:true,nomeFantasia:true,email:true,categorias:true,cidade:true,uf:true,fabricanteTinta:true};
const boletins = () => prisma.produtoTinta.findMany({where:{ativo:true,conferidoEm:{not:null},boletimRevisao:{not:null},boletimUrl:{not:null}},orderBy:[{fabricante:'asc'},{produto:'asc'}]});
const erroAuth = e => NextResponse.json({error:e.message},{status:e.message==='Unauthorized'?401:403});
export async function GET(req) {
  try { await requireRole(ROLES); } catch(e) { return erroAuth(e); }
  const u=new URL(req.url), tipo=String(u.searchParams.get('tipo')||'TINTA').toUpperCase(), estudoId=String(u.searchParams.get('estudoId')||'');
  if (!FAMILIAS_COTACAO[tipo]) return NextResponse.json({error:'Família de cotação desconhecida.'},{status:400});
  const todos=await prisma.fornecedor.findMany({where:{ativo:true},select:fornecedorSelect,orderBy:{razaoSocial:'asc'}});
  const fornecedores=todos.filter(f=>f.email&&fornecedorAtende(f,tipo)).map(f=>({id:f.id,nome:f.nomeFantasia||f.razaoSocial,email:f.email,praca:[f.cidade,f.uf].filter(Boolean).join('/'),fabricanteTinta:f.fabricanteTinta}));
  const cotacoes=estudoId?await prisma.cotacaoEstudo.findMany({where:{estudoId,tipo},orderBy:{enviadoEm:'desc'},select:{
    id:true,enviadoEm:true,enviadoPorNome:true,snapshot:true,
    fornecedores:{select:{id:true,nome:true,email:true,enviadoEm:true,erroEnvio:true,respondidoEm:true,valorTotal:true,vencedor:true,resposta:true},orderBy:{valorTotal:'asc'}},
  }}):[];
  return NextResponse.json({fornecedores,cotacoes,boletins:tipo==='TINTA'?await boletins():[],catalogoUrl:'/comercial/produtos/tintas'});
}
const Body=z.object({estudoId:z.string().min(1),tipo:z.string().default('TINTA'),fornecedorIds:z.array(z.string()).min(1).max(100),
  snapshot:z.object({}).passthrough().default({}),escolhas:z.record(z.string(),z.string()).default({}),previa:z.boolean().default(false),confirmacao:z.string().optional()});
export async function POST(req) {
  let user; try { user=await requireRole(ROLES); } catch(e) { return erroAuth(e); }
  let b; try { b=Body.parse(await req.json()); } catch(e) { return NextResponse.json({error:e.issues?.[0]?.message||'Dados inválidos.'},{status:400}); }
  b.tipo=b.tipo.toUpperCase();
  if (!FAMILIAS_COTACAO[b.tipo]) return NextResponse.json({error:'Família de cotação desconhecida.'},{status:400});
  const ids=[...new Set(b.fornecedorIds)].sort();
  const escolhidos=await prisma.fornecedor.findMany({where:{id:{in:ids},ativo:true},select:fornecedorSelect,orderBy:{id:'asc'}});
  if (escolhidos.length!==ids.length||escolhidos.some(f=>!f.email||!fornecedorAtende(f,b.tipo))) return NextResponse.json({error:'Um fornecedor selecionado está indisponível, sem e-mail ou não atende esta família.'},{status:400});
  const est=await prisma.estudoFabricacao.findUnique({where:{id:b.estudoId},select:{numero:true,ano:true,orcamento:{select:{numero:true,cliente:true,obra:true}}}});
  if (!est) return NextResponse.json({error:'Estudo não encontrado.'},{status:404});
  const obra=[est.orcamento?.cliente,est.orcamento?.obra].filter(Boolean).join(' · ')||'obra em orçamento';
  const ctx={obra,numero:est.numero,ano:est.ano,familia:FAMILIAS_COTACAO[b.tipo].rotulo};
  let destinatarios;
  try {
    const fichas=b.tipo==='TINTA'?await boletins():[];
    destinatarios=escolhidos.map(f=>{
      const snapshot=b.tipo==='TINTA'?criarSnapshotTinta(f,b.snapshot,fichas,b.escolhas):b.snapshot;
      const nome=f.nomeFantasia||f.razaoSocial;
      return {fornecedorId:f.id,nome,email:f.email,snapshot,mensagem:b.tipo==='TINTA'?emailCotacaoTinta({nome},snapshot,ctx):emailCotacaoAco({nome},snapshot,ctx)};
    });
  } catch(e) { return NextResponse.json({error:e.message},{status:400}); }
  // A revisão é recalculada a cada envio: mudança de ficha, destinatário ou requisitos pede nova confirmação.
  const confirmacao=createHash('sha256').update(JSON.stringify({estudoId:b.estudoId,tipo:b.tipo,destinatarios})).digest('hex');
  if (b.previa) return NextResponse.json({destinatarios,confirmacao});
  if (b.tipo==='TINTA'&&b.confirmacao!==confirmacao) return NextResponse.json({error:'Revise a prévia atual de cada destinatário antes de confirmar o envio.'},{status:409});
  const cot=await prisma.cotacaoEstudo.create({data:{estudoId:b.estudoId,tipo:b.tipo,
    snapshot:b.tipo==='TINTA'?{versao:2,camadas:destinatarios[0].snapshot.camadas.map(({boletim,produto,...d})=>d)}:b.snapshot,
    enviadoPorId:user.id,enviadoPorNome:user.name||user.email||null,
    fornecedores:{create:destinatarios.map(f=>({fornecedorId:f.fornecedorId,nome:f.nome,email:f.email,token:gerarTokenForte(32),snapshot:f.snapshot}))},
  },select:{id:true,fornecedores:{select:{id:true,nome:true,email:true,token:true,snapshot:true}}}});
  let ok=0;
  for (const f of cot.fornecedores) {
    const msg=b.tipo==='TINTA'?emailCotacaoTinta(f,f.snapshot,{...ctx,token:f.token}):emailCotacaoAco(f,f.snapshot,{...ctx,token:f.token});
    const r=await sendEmail({to:f.email,subject:msg.subject,html:msg.html,text:msg.text,replyTo:user.email||undefined}).catch(e=>({ok:false,erro:e.message}));
    await prisma.cotacaoEstudoFornecedor.update({where:{id:f.id},data:r?.ok?{enviadoEm:new Date()}:{erroEnvio:String(r?.erro||'Falha no envio').slice(0,200)}});
    if(r?.ok)ok++;
  }
  await prisma.auditLog.create({data:{userId:user.id,action:'COTACAO_ESTUDO_ENVIADA',entity:'CotacaoEstudo',entityId:cot.id,diff:{tipo:b.tipo,estudoId:b.estudoId,convidados:cot.fornecedores.length,enviados:ok}}}).catch(()=>{});
  return NextResponse.json({ok:true,id:cot.id,convidados:cot.fornecedores.length,enviados:ok});
}
