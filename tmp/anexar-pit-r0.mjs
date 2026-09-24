import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import env from '@next/env';
env.loadEnvConfig(process.cwd());
const {prisma}=await import('../lib/prisma.js');
const {put,del}=await import('@vercel/blob');
const nomeArquivo='PIT-OP-122-Torg-R0.pdf';
const opNumero='122';
const fonte='https://torgmetal637.sharepoint.com/:x:/s/TorgMetal/IQB8Vmm1deg5R5wYBc71VC5qAccNiLPegXF6f9__GcZfb7I?e=vJeroE';
try{
 const op=await prisma.oP.findFirst({where:{numero:opNumero},select:{id:true,numero:true,cliente:true,obra:true}});
 if(!op||!op.cliente.toUpperCase().includes('TMSA'))throw Error('OP não corresponde à obra esperada.');
 const docs=await prisma.documentoQualidade.findMany({where:{opNumero,tipo:'PIT_CLIENTE',ativo:true},select:{id:true,nome:true,arquivoNome:true,numeroDocumento:true}});
 if(process.argv[2]!=='anexar'){console.log(JSON.stringify({op,documentos:docs}));}
 else{
  const existente=docs.find(d=>d.arquivoNome===nomeArquivo);
  if(existente){console.log(JSON.stringify({existente,opId:op.id}));}
  else{
   const bytes=await fs.readFile('output/pdf/'+nomeArquivo);if(!bytes.subarray(0,8).includes(Buffer.from('%PDF-')))throw Error('PDF inválido');
   const blob=await put(`qualidade/pit-cliente/${opNumero}/pit-r0-torg.pdf`,bytes,{access:'public',addRandomSuffix:true,contentType:'application/pdf'});
   let doc;
   try{doc=await prisma.$transaction(async tx=>{
    const d=await tx.documentoQualidade.create({data:{nome:'PIT do cliente — padrão Torg',categoria:'ANEXO',tipo:'PIT_CLIENTE',opNumero,numeroDocumento:'0',arquivoUrl:blob.url,arquivoNome:nomeArquivo,arquivoTipo:'application/pdf',arquivoTamanho:bytes.length,dataEmissao:new Date('2026-09-10T12:00:00Z'),observacao:'Reformatação visual do PIT TPR00751-008-00103-R0. Tipo de emissão C: Para conhecimento. Conteúdo do cliente preservado. Anexado pelo assistente a pedido de Vitor.',sharepointUrl:fonte}});
    await tx.auditLog.create({data:{action:'ANEXAR_PIT_CLIENTE',entity:'DocumentoQualidade',entityId:d.id,diff:{opNumero,nome:d.nome,revisao:'0',origem:'assistente_solicitado_por_vitor',fonte,sha256:crypto.createHash('sha256').update(bytes).digest('hex')}}});return d;
   });}catch(e){await del(blob.url).catch(()=>{});throw e;}
   const r=await fetch(blob.url,{cache:'no-store'});if(!r.ok)throw Error('Arquivo anexado, mas download não confirmado.');
   const salvo=Buffer.from(await r.arrayBuffer());if(!salvo.equals(bytes))throw Error('Arquivo anexado diverge do PDF conferido.');
   console.log(JSON.stringify({id:doc.id,opId:op.id,nome:doc.nome,arquivoNome:doc.arquivoNome,tamanho:doc.arquivoTamanho,verificado:true}));
  }
 }
}finally{await prisma.$disconnect();}
