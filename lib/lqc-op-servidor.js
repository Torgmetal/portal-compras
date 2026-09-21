import 'server-only';
import {createHash} from 'node:crypto';
import {getAccessToken} from './sharepoint';
import {lerEstudoComercial} from './estudo-comercial';
import {prepararOpDaLqc} from './lqc-op';
import {conferirCustosLqc} from './lqc-op-conferencia';

const GRAPH='https://graph.microsoft.com/v1.0';
const hash = valor => createHash('sha256').update(valor).digest('hex');

/** Leitura exata, sem escolher outra revisão/OS só porque tem o mesmo número. */
export async function lerFonteLqc(estudo) {
  const nome=estudo.composicao?.origemSharePoint;
  if (!nome) return null;
  if(typeof nome !== 'string' || !/\.xlsx?$/i.test(nome)) throw new Error('A origem desta LQC precisa ser vinculada à planilha do servidor.');
  const token=await getAccessToken(), drive=process.env.SHAREPOINT_DRIVE_ID;
  const headers={Authorization:`Bearer ${token}`};
  const json=async url=>{
    const r=await fetch(url,{headers,cache:'no-store',signal:AbortSignal.timeout(20000)});
    if(!r.ok) throw new Error(`Não foi possível conferir a planilha no SharePoint (${r.status}). Tente novamente.`);
    return r.json();
  };
  const encontradas=[];
  let url=`${GRAPH}/drives/${drive}/root/search(q='${encodeURIComponent(nome.replace(/'/g, "''"))}')?$select=id,name,eTag,lastModifiedDateTime,webUrl,parentReference&$top=200`;
  while(url) {
    const j=await json(url);
    encontradas.push(...(j.value || []).filter(i=>i.name===nome));
    url=j['@odata.nextLink'] || null;
  }
  if(encontradas.length !== 1) throw new Error(encontradas.length ? 'Há mais de uma cópia desta planilha no servidor. Defina a origem correta antes de gerar a OP.' : `Planilha de origem não encontrada: ${nome}.`);
  const itemUrl=`${GRAPH}/drives/${drive}/items/${encontradas[0].id}`;
  const item=await json(`${itemUrl}?$select=id,name,eTag,lastModifiedDateTime,webUrl,parentReference`);
  if(item.name !== nome) throw new Error('A planilha foi renomeada. Atualize a origem da LQC.');
  const r=await fetch(`${itemUrl}/content`,{headers,cache:'no-store',signal:AbortSignal.timeout(20000)});
  if(!r.ok) throw new Error(`Não foi possível ler a planilha (${r.status}).`);
  const bytes=Buffer.from(await r.arrayBuffer());
  const atual=await json(`${itemUrl}?$select=eTag`);
  if(!item.eTag || atual.eTag !== item.eTag) throw new Error('A planilha mudou durante a leitura. Tente novamente.');
  const dados=await lerEstudoComercial(bytes);
  const arquivo={id:item.id,nome:item.name,webUrl:item.webUrl,modificado:item.lastModifiedDateTime,etag:item.eTag,sha256:hash(bytes)};
  const base=(process.env.SHAREPOINT_ORCAMENTOS_BASE || '/Comercial/1. Orçamento').replace(/\/$/,'');
  const caminho=String(item.parentReference?.path || '').split('root:')[1] || '';
  const relativo=caminho.startsWith(`${base}/`) ? caminho.slice(base.length+1).split('/') : [];
  const pasta=relativo.length>=4 ? relativo.slice(0,-1).join('/') : null;
  return {arquivo,dados,pasta};
}

/** Não escreve na LQC nem substitui custos ajustados no portal. Divergências ficam visíveis. */
export async function prepararOpConferida(estudo, lerFonte=lerFonteLqc) {
  const previa=prepararOpDaLqc(estudo);
  const fonte=await lerFonte(estudo);
  const conferencia=fonte ? conferirCustosLqc(previa,fonte.dados) : {ok:true,linhas:[],origem:'PORTAL'};
  conferencia.codigo=hash(JSON.stringify({estudoId:estudo.id,atualizadoEm:previa.atualizadoEm,
    valorContrato:previa.valorContrato,itens:previa.itens,fonte:fonte?.arquivo || null}));
  previa.conferencia=conferencia;
  previa.estudoArquivo=fonte?.arquivo || null;
  previa.orcamentoPasta=fonte?.pasta || null;
  previa.estudoDados={...previa.estudoDados,conferencia,arquivo:previa.estudoArquivo,
    ...(fonte ? {planilhaConferida:fonte.dados} : {})};
  if(fonte) {
    const detalhe=fonte.dados.custos?.grupos.find(g=>String(g.item)==='1.2')?.itens?.map(i=>i.descricao).filter(Boolean).join('; ');
    for(const item of previa.itens.filter(i=>i.categoria==='PARAFUSOS')) {
      if(detalhe) item.observacao+=`. Especificação da planilha: ${detalhe}. Valor estimado por kg de estrutura; quantidade física a detalhar pela Engenharia.`;
    }
  }
  return previa;
}
