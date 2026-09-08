import {numeroBR} from './numero-br';
const normal=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ');
export const chaveMarca=v=>String(v??'').trim().toUpperCase();
const opChave=v=>chaveMarca(v).replace(/^OP[-\s]*/,'').replace(/^T(?=\d)/,'').replace(/^0+(?=\d)/,'');
const vazio=v=>v==null||String(v).trim()==='';
const numero=v=>typeof v==='number'?v:/^-?\d+(?:[.,]\d+)*$/.test(String(v).trim())?numeroBR(v,NaN):NaN;
const aliases={marca:['marca'],qte:['quantidade','qtd','qte','qtde','qtd.','qte.','qtde.'],descricao:['descricao','descrição'],op:['op','obra','ordem de producao'],pesoTotal:['peso total','peso total (kg)','peso total kg'],pesoUn:['peso unitario','peso unitario (kg)','peso unitario kg','peso unit. (kg)','peso un. (kg)','peso unit.','peso un.','peso unit','peso un']};
export function linhasDaTabela(tabela){
 const rows=tabela.filter(r=>r.some(v=>!vazio(v)));
 if(!rows.length)throw Error('A lista está vazia.');
 const hi=rows.findIndex(r=>r.some(v=>normal(v)==='marca'));
 let col={marca:0,qte:1};let dados=rows;
 if(hi>=0){const h=rows[hi].map(normal);col={};for(const [k,a] of Object.entries(aliases))col[k]=h.findIndex(v=>a.includes(v));
  if(h.some(v=>/^(peso|qtd|qte|qtde|quant)/.test(v)&&!Object.values(aliases).some(a=>a.includes(v))))throw Error('Coluna de quantidade ou peso não reconhecida. Use Quantidade, Peso total (kg) ou Peso unitário (kg).');
  dados=rows.slice(hi+1);
 }else if(rows.some(r=>r.filter(v=>!vazio(v)).length>2))throw Error('Use um cabeçalho para listas com descrição ou peso. Sem cabeçalho: Marca e Quantidade.');
 if(dados.length>2000)throw Error('Importe no máximo 2.000 linhas por vez.');
 return dados.map((r,i)=>{const l={linha:i+(hi>=0?hi+2:1)};for(const [k,j] of Object.entries(col))if(j>=0)l[k]=r[j];l.marca=String(l.marca??'').trim();return l;});
}
export function conferirItensTerceiro(linhas,catalogo,opNumero){
 const indices=new Map(),ocorrencias=new Map();
 for(const p of catalogo){const k=chaveMarca(p.marca);if(!indices.has(k))indices.set(k,[]);indices.get(k).push(p);}
 for(const l of linhas){const k=chaveMarca(l.marca);ocorrencias.set(k,(ocorrencias.get(k)||0)+1);}
 return linhas.map((l,i)=>{
  const base={linha:l.linha||i+1,marca:l.marca,avisos:[]};const falha=erro=>({...base,ok:false,erro});
  const k=chaveMarca(l.marca);if(!k)return falha('Informe a marca.');
  if(!vazio(l.op)&&opChave(l.op)!==opChave(opNumero))return falha('A OP da linha é diferente da OP selecionada.');
  if(ocorrencias.get(k)>1)return falha('Marca repetida na lista. Deixe uma linha com a quantidade a enviar.');
  const candidatas=indices.get(k)||[];
  if(!candidatas.length)return falha('Marca não encontrada nesta OP.');
  if(candidatas.length>1)return falha('Marca encontrada em mais de uma frente/lista. Confira manualmente.');
  const p=candidatas[0],qte=vazio(l.qte)?Number(p.qte):numero(l.qte);
  if(!Number.isSafeInteger(qte)||qte<=0)return falha('A quantidade deve ser um número inteiro maior que zero.');
  if(qte>Number(p.qte))return falha(`Quantidade maior que a cadastrada na OP (${p.qte}).`);
  if(vazio(l.qte))base.avisos.push('Usando a quantidade da OP; confira se o envio é parcial.');
  let peso;
  if(!vazio(l.pesoTotal))peso=numero(l.pesoTotal);
  else if(!vazio(l.pesoUn))peso=numero(l.pesoUn)*qte;
  else peso=(Number(p.pesoUnitKg)>0?Number(p.pesoUnitKg):Number(p.qte)>0?Number(p.pesoTotalKg)/Number(p.qte):NaN)*qte;
  if(!Number.isFinite(peso)||peso<0)return falha('Peso inválido. Informe um peso total ou unitário válido.');
  if(peso===0)base.avisos.push('Peso zerado: confira antes de salvar o romaneio.');
  if(!vazio(l.pesoTotal)||!vazio(l.pesoUn))base.avisos.push('Peso informado na lista.');
  return {...base,ok:true,item:{marca:p.marca,descricao:vazio(l.descricao)?p.descricao||'':String(l.descricao).trim(),qte,pesoTotal:Math.round(peso*1000)/1000}};
 });
}
