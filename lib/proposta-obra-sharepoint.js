import 'server-only';
import { assinaturaConsultaValida } from './proposta-obra-assinatura';
import { createHash } from 'node:crypto';
import { resolveServidorDriveId } from './sharepoint-lpc';
import { getAccessToken } from './sharepoint';
import { ordenarPropostasConsulta, consultaConferida } from './proposta-obra-consulta';
const BASE = 'https://graph.microsoft.com/v1.0';
const caminho = p => p.split('/').filter(Boolean).map(encodeURIComponent).join('/');
const norm = s => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

export async function consultarPropostaDaObra(op) {
 const token=await getAccessToken();const drivePadrao=process.env.SHAREPOINT_DRIVE_ID;const driveServidor=await resolveServidorDriveId();
 async function get(sufixo,binario=false,drive=drivePadrao){
  const r=await fetch(`${BASE}/drives/${drive}/${sufixo}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:AbortSignal.timeout(12000)});
  if(r.status===404)return null;
  if(!r.ok)throw new Error('Não foi possível consultar a pasta de propostas. Tente novamente.');
  if(binario){if(Number(r.headers.get('content-length'))>10000000)throw new Error('Proposta muito grande para consulta.');const b=Buffer.from(await r.arrayBuffer());if(b.length>10000000)throw new Error('Proposta muito grande para consulta.');return b;}
  return r.json();
 }
 async function filhos(p,drive=drivePadrao){
  const r=await get(`${p}/children?$select=id,name,folder,file,size,lastModifiedDateTime&$top=999`,false,drive);
  if(r?.['@odata.nextLink'])throw new Error('A pasta tem muitos arquivos. Organize a proposta vigente na pasta de propostas da OP.');
  return (r?.value||[]).map(a=>({...a,driveId:drive}));
 }
 const encontrados=new Map();
 const adicionar=lista=>lista.forEach(a=>{if(a.id&&!a.folder){
  const key=`${a.driveId||drivePadrao}:${a.id}`;
  const anterior=encontrados.get(key)||{};
  encontrados.set(key,{...a,...anterior,driveId:a.driveId||drivePadrao});
 }});
 adicionar(Array.isArray(op.propostas)?op.propostas:[]);
 // Pasta da OP identificada pelo número exato, sem busca global por nome de cliente.
 const raiz=process.env.SHAREPOINT_OP_BASE_FOLDER||'/Ordem de Servico/01. OP';
 const ops=await filhos(`root:/${caminho(raiz)}:`,driveServidor);
 const numero=String(op.numero).replace(/^0+/,'')||'0';
 const pastas=ops.filter(a=>a.folder&&String(Number(a.name.match(/^OP[- ]0*(\d+)(?:\D|$)/i)?.[1]))===numero);
 if(pastas.length>1)throw new Error('Mais de uma pasta encontrada para esta OP. Confira o vínculo antes de consultar.');
 if(pastas[0]){
  const comercial=(await filhos(`items/${pastas[0].id}`,driveServidor)).find(a=>a.folder&&/^1\.?\s*comercial$/i.test(a.name));
  if(comercial){const lista=await filhos(`items/${comercial.id}`,driveServidor);adicionar(lista);for(const p of lista.filter(a=>a.folder&&norm(a.name).includes('proposta')).slice(0,3))adicionar(await filhos(`items/${p.id}`,driveServidor));}
 }
 if(op.orcamentoPasta){
  const sub=String(op.orcamentoPasta).replace(/^\/+|\/+$/g,'');
  if(sub.split('/').some(v=>v==='..'||v==='.'||v.includes('\\')))throw new Error('Vínculo da pasta do orçamento inválido.');
  const base=process.env.SHAREPOINT_ORCAMENTOS_BASE||'/Comercial/1. Orçamento';
  const lista=await filhos(`root:/${caminho(`${base}/${sub}`)}:`);
  for(const p of lista.filter(a=>a.folder&&norm(a.name).includes('proposta')).slice(0,3))adicionar(await filhos(`items/${p.id}`));
 }
 const escolhido=ordenarPropostasConsulta([...encontrados.values()])[0];
 if(!escolhido)return null;
 if(!/^[A-Za-z0-9_!.\-]+$/.test(escolhido.id))throw new Error('Vínculo de proposta inválido.');
 const buffer=await get(`items/${escolhido.id}/content`,true,escolhido.driveId);
 if(!buffer)throw new Error('A proposta vinculada não está mais disponível.');
 const hash=createHash('sha256').update(buffer).digest('hex');
 const consulta=assinaturaConsultaValida(op.id,escolhido)?consultaConferida(escolhido,hash):null;
 const identidade={nome:escolhido.nome,tipo:escolhido.tipo,revisao:escolhido.revisao};
 if(!consulta)return {...identidade,pendente:true};
 return {...identidade,...consulta};
}
