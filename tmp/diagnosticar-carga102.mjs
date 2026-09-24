import fs from 'node:fs/promises';
import env from '@next/env';env.loadEnvConfig(process.cwd());
const {prisma}=await import('../lib/prisma.js');
try{
const op=await prisma.oP.findFirst({where:{numero:'102'},select:{id:true,numero:true}});
console.log(op);
const cargas=await prisma.$queryRaw`SELECT * FROM "CargaSimulada" WHERE "opId"=${op.id} ORDER BY "createdAt" DESC LIMIT 5`;
await fs.writeFile('/tmp/carga102-simulacoes.json',JSON.stringify(cargas));
console.log(cargas.map(x=>({id:x.id,data:x.createdAt,romaneio:x.romaneioPrevioId,resumo:x.resumo,avisos:x.avisos,cargas:x.cargas?.length})));
}finally{await prisma.$disconnect()}
