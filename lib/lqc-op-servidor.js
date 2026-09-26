import 'server-only';
import {createHash} from 'node:crypto';
import {getAccessToken} from './sharepoint';
import {varrerPastasDeLqc, lerNomeLqc} from './lqc-sharepoint';
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
  // ⚠⚠ ERA `root/search(q={nome})`, E A BUSCA DESTE DRIVE DEVOLVE HTTP 500 DESDE 22–23/09/2026 —
  // gerar OP a partir da LQC parou de funcionar e ninguém foi avisado, porque isto é tela e não
  // cron. Agora vem da varredura de pastas do importador.
  //
  // ⚠ O ANO SAI DO PRÓPRIO NOME (`LQC-283-26-…` → 2026), porque a varredura é por pasta de ano.
  // A busca antiga era do drive inteiro; se o nome não disser o ano, procura no ano corrente, que
  // é onde as propostas vivas estão. Errar o ano vira "não encontrada", não a planilha errada.
  const lido = lerNomeLqc(nome);
  const anoDaLqc = lido?.ano != null ? 2000 + lido.ano : new Date().getFullYear();
  const {arquivos} = await varrerPastasDeLqc(anoDaLqc);
  // ⚠ De-dup pelo id do drive: duas cópias DE VERDADE (pastas diferentes) continuam sendo duas
  // e derrubam a geração, que é o certo; o mesmo item contado duas vezes, não.
  const encontradas = [...new Map(arquivos.filter(a => a.nome === nome).map(a => [a.id, a])).values()];
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
