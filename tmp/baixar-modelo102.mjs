import fs from 'node:fs/promises';import env from '@next/env';env.loadEnvConfig(process.cwd());
const code=(await fs.readFile('lib/sharepoint.js','utf8')).replace('import "server-only";','');const sp=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const base=await sp.acharPastaOp('102');const token=await sp.getAccessToken();
const raiz=base+'/2. Engenharia/2.5 Projetos';let lista=[];
async function walk(p,d=0){if(d>4)return;const r=await fetch(`https://graph.microsoft.com/v1.0/drives/${process.env.SHAREPOINT_DRIVE_ID}/root:${encodeURI(p)}:/children?$select=name,folder,file,size&$top=999`,{headers:{Authorization:`Bearer ${token}`}});if(!r.ok)throw Error('Graph '+r.status);for(const x of (await r.json()).value||[]){if(x.folder&&!/obsolet/i.test(x.name))await walk(p+'/'+x.name,d+1);else if(/\.ifc$/i.test(x.name))lista.push({path:p+'/'+x.name,nome:x.name,size:x.size});}}
await walk(raiz);console.log(lista);
await fs.mkdir('/tmp/carga102',{recursive:true});
for(let i=0;i<lista.length;i++){const b=await sp.downloadFileByPath({driveId:process.env.SHAREPOINT_DRIVE_ID,fullPath:lista[i].path});await fs.writeFile(`/tmp/carga102/modelo-${i}.ifc`,b);}
await fs.writeFile('/tmp/carga102/modelos.json',JSON.stringify(lista));
