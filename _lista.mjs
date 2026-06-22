import { PrismaClient } from "@prisma/client";
const p=new PrismaClient();
const real=(d)=>{const x=new Date(d);return x.getUTCHours()===0&&x.getUTCMinutes()===0&&x.getUTCSeconds()===0;};
const todas=await p.funcionario.findMany({where:{ativo:true},select:{nome:true,matricula:true,dataAdmissao:true,setor:{select:{nome:true}},cargo:{select:{nome:true}}}});
const probl=todas.filter(f=>f.dataAdmissao&&(!real(f.dataAdmissao)||f.dataAdmissao>new Date()))
  .map(f=>({matricula:f.matricula||"",nome:f.nome||"",setor:f.setor?.nome||"",cargo:f.cargo?.nome||"",dataSistema:f.dataAdmissao.toISOString(),problema:!real(f.dataAdmissao)?"Carimbada no import (hora 20:49 — data real perdida)":"Data no futuro"}))
  .sort((a,b)=>a.problema.localeCompare(b.problema)||a.nome.localeCompare(b.nome));
console.log(JSON.stringify(probl));
await p.$disconnect();
