import fs from 'node:fs/promises';
import env from '@next/env';
env.loadEnvConfig(process.cwd());
const {prisma}=await import('../lib/prisma.js');
try{
 const docs=await prisma.documentoQualidade.findMany({where:{opNumero:'122',tipo:'PIT_CLIENTE',ativo:true}});
 for(const d of docs){const r=await fetch(d.arquivoUrl,{cache:'no-store'});if(!r.ok)throw Error('Falha ao consultar anexo');const b=Buffer.from(await r.arrayBuffer());const destino=`/tmp/pit-excel-122/portal-${d.numeroDocumento}.pdf`;await fs.writeFile(destino,b);console.log(JSON.stringify({id:d.id,nome:d.nome,tipo:d.arquivoTipo,bytes:b.length,destino}));}
}finally{await prisma.$disconnect();}
