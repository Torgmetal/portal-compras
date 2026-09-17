import {NextResponse} from 'next/server';
import {put,del} from '@vercel/blob';
import {z} from 'zod';
import {prisma} from '@/lib/prisma';
import {requireRole} from '@/lib/session';
import {requireGestaoPit,requireConsultaPit} from '@/lib/pit-acesso';
import {isBlobUrlSegura} from '@/lib/blob-url';
import {dispArquivo} from '@/lib/arquivo-http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
const num=p=>String(p.opNumero).replace(/\D/g,'').padStart(3,'0');
const falha=e=>NextResponse.json({error:e.message},{status:e.message==='Unauthorized'?401:403});
const leitura=['ADMIN','QUALIDADE','COMERCIAL','ENGENHARIA','PLANEJAMENTO','PCP','PRODUCAO','COMPRAS','EXPEDICAO','FINANCEIRO','ALMOXARIFADO'];
export async function GET(req,{params}){
 try{await requireConsultaPit();}catch(e){return falha(e);}
 const opNumero=num(params),id=new URL(req.url).searchParams.get('arquivo');
 if(!id){const documentos=await prisma.documentoQualidade.findMany({where:{opNumero,tipo:'PIT_CLIENTE',ativo:true},orderBy:{createdAt:'desc'},select:{id:true,nome:true,numeroDocumento:true,arquivoNome:true,createdAt:true}});return NextResponse.json({documentos});}
 const doc=await prisma.documentoQualidade.findFirst({where:{id,opNumero,tipo:'PIT_CLIENTE',ativo:true}});
 if(!doc||!isBlobUrlSegura(doc.arquivoUrl))return NextResponse.json({error:'Documento não encontrado.'},{status:404});
 const r=await fetch(doc.arquivoUrl,{redirect:'error',signal:AbortSignal.timeout(20000)});
 if(!r.ok)return NextResponse.json({error:'Arquivo indisponível.'},{status:502});
 const bytes=Buffer.from(await r.arrayBuffer());
 if(doc.arquivoTipo!=='application/pdf'){
 const XLSX=await import('xlsx');const w=XLSX.read(bytes,{type:'buffer',cellHTML:false});
 return NextResponse.json({abas:w.SheetNames.map(nome=>({nome,linhas:XLSX.utils.sheet_to_json(w.Sheets[nome],{header:1,raw:false,defval:''}).slice(0,2000).map(l=>l.slice(0,100))}))},{headers:{'Cache-Control':'private, no-store'}});
 }
 return new NextResponse(bytes,{headers:{'X-Frame-Options':'SAMEORIGIN','Content-Security-Policy':"frame-ancestors 'self'",'Content-Type':'application/pdf','Content-Disposition':dispArquivo(doc.arquivoNome,'inline'),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
export async function POST(req,{params}){
 let user;try{user=await requireGestaoPit();}catch(e){return falha(e);}
 const opNumero=num(params);if(!await prisma.oP.findFirst({where:{numero:opNumero},select:{id:true}}))return NextResponse.json({error:'OP não encontrada.'},{status:404});
 const form=await req.formData();const arquivo=form.get('arquivo');
 const parsed=z.object({nome:z.string().trim().min(2).max(180),revisao:z.string().trim().max(30)}).safeParse({nome:form.get('nome'),revisao:form.get('revisao')||''});
 if(!parsed.success||!arquivo||typeof arquivo.arrayBuffer!=='function'||arquivo.size<=0||arquivo.size>4*1024*1024)return NextResponse.json({error:'Informe o título e um PDF ou Excel de até 4 MB.'},{status:400});
 const ext=arquivo.name.split('.').pop().toLowerCase();
 if(!['pdf','xlsx','xls'].includes(ext))return NextResponse.json({error:'Use PDF, XLSX ou XLS.'},{status:400});
 const bytes=Buffer.from(await arquivo.arrayBuffer());
 if(ext==='pdf'&&!bytes.subarray(0,1024).includes(Buffer.from('%PDF-')))return NextResponse.json({error:'PDF inválido.'},{status:400});
 if(ext!=='pdf'){try{const XLSX=await import('xlsx');if(!XLSX.read(bytes,{type:'buffer',bookSheets:true}).SheetNames.length)throw Error();}catch{return NextResponse.json({error:'Planilha inválida.'},{status:400});}}
 let blob;try{
 blob=await put(`qualidade/pit-cliente/${opNumero}/pit.${ext}`,bytes,{access:'public',addRandomSuffix:true,contentType:ext==='pdf'?'application/pdf':ext==='xlsx'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'application/vnd.ms-excel'});
 const doc=await prisma.$transaction(async tx=>{const d=await tx.documentoQualidade.create({data:{nome:parsed.data.nome,categoria:'ANEXO',tipo:'PIT_CLIENTE',opNumero,numeroDocumento:parsed.data.revisao||null,arquivoUrl:blob.url,arquivoNome:arquivo.name,arquivoTipo:ext==='pdf'?'application/pdf':'application/vnd.ms-excel',arquivoTamanho:arquivo.size,createdById:user.id}});await tx.auditLog.create({data:{userId:user.id,action:'ANEXAR_PIT_CLIENTE',entity:'DocumentoQualidade',entityId:d.id,diff:{opNumero,nome:d.nome,revisao:d.numeroDocumento}}});return d;});
 return NextResponse.json({documento:{id:doc.id,nome:doc.nome,numeroDocumento:doc.numeroDocumento,arquivoNome:doc.arquivoNome,createdAt:doc.createdAt}});
 }catch{if(blob)await del(blob.url).catch(()=>{});return NextResponse.json({error:'Não foi possível salvar o PIT. Tente novamente.'},{status:500});}
}
