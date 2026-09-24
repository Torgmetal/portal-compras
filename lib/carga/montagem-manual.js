// Ajustes de posição e rotação por volume. Compartilhado entre navegador e API.
// As dimensões e os membros originais nunca são alterados pelo editor.
import { madeiraDaCarga, madeiraDaUnidade, pecasDeMadeira } from './madeira';
import { baseCompativelParaCaixa, coberturaDaBase, temGiroSemBaseConfirmada } from './apoios';
import { caibrosDoMotor, noLugarDoMotor } from './apoio-motor';
import { temBaseDeMadeira } from './classificar';
import { noAssoalho, travamentoDaCarga } from './travamento';
const arred = (v) => Math.round(v * 1000) / 1000;
export const rotacaoDaUnidade = (u) => u.rotacaoManual || { x: 0, y: 0, z: 0 };
export function girarPonto([x,y,z], r) {
  const [rx,ry,rz]=[r.x,r.y,r.z].map(v=>v*Math.PI/180);
  const xz=x*Math.cos(rz)-y*Math.sin(rz), yz=x*Math.sin(rz)+y*Math.cos(rz);
  const xy=xz*Math.cos(ry)+z*Math.sin(ry), zy=-xz*Math.sin(ry)+z*Math.cos(ry);
  return [xy,yz*Math.cos(rx)-zy*Math.sin(rx),yz*Math.sin(rx)+zy*Math.cos(rx)];
}
export function limitesRotacionados(u, r=rotacaoDaUnidade(u)) {
  const c=u.girada?u.L:u.C,l=u.girada?u.C:u.L;
  const pontos=[];for(const x of [0,c])for(const y of [0,u.A])for(const z of [0,l])pontos.push(girarPonto([x,y,z],r));
  const min=[0,1,2].map(i=>arred(Math.min(...pontos.map(p=>p[i]))));
  const max=[0,1,2].map(i=>arred(Math.max(...pontos.map(p=>p[i]))));
  return {min,tamanho:{x:arred(max[0]-min[0]),y:arred(max[1]-min[1]),z:arred(max[2]-min[2])}};
}
export function ajustarVolume(u, edicao) {
  const rotacao=edicao.rotacao||rotacaoDaUnidade(u),box=limitesRotacionados(u,rotacao);
  return {...u,x:edicao.x,y:edicao.y,z:edicao.z,rotacaoManual:{...rotacao},fx:box.tamanho.x,fy:box.tamanho.y,fz:box.tamanho.z};
}
const topo=(u)=>u.y+(u.fy||u.A);
const inter=(a,b,eixo,dim)=>Math.min(a[eixo]+a[dim],b[eixo]+b[dim])-Math.max(a[eixo],b[eixo]);
export function recalcularMontagem(carga, madeira=100) {
  const itens=carga.itens.map(u=>ajustarVolume(u,{x:u.x,y:u.y,z:u.z}));
  const passos=[...carga.passos],ordem=new Map(passos.map((id,i)=>[id,i])),verificacoes=[];
  const aviso=(tipo,u,texto)=>verificacoes.push({tipo,volume:u.volume,id:u.id,texto});
  const niveis=[...new Set(itens.map(u=>Math.round(u.y)))].sort((a,b)=>a-b);
  const porId=new Map(itens.map(u=>[u.id,u]));
  for(const u of itens){
    u.camada=niveis.indexOf(Math.round(u.y));u.sobre=[];delete u.alerta;
    if(u.x<0||u.z<0||u.y<0||u.x+u.fx>carga.veiculo.C+1||u.z+u.fz>carga.veiculo.L+1||topo(u)>carga.veiculo.alturaUtil+1)aviso('limite',u,`Volume ${u.volume}: ultrapassa os limites úteis da carroceria.`);
    if(u.topoVazado)aviso('geometria',u,`Volume ${u.volume}: topo irregular ou vazado. Não usar como base para outro volume; conferir calços e amarração no carregamento.`);
    // aço nunca direto no assoalho (Vitor, 24/09/2026): sobre caibro, para a empilhadeira e a cinta passarem por baixo
    if(!temBaseDeMadeira(u)&&u.y<madeira-1&&!u.pilha)aviso('madeira',u,`Volume ${u.volume}: está direto no assoalho. Coloque sobre caibros (${Math.round(madeira/10)} cm) para conseguir retirar com a empilhadeira ou a cinta.`);
    // no assoalho = sobre o caibro do piso (aço) ou direto (caixa, engradado, palete): não tem volume de apoio a conferir
    if(u.y>(temBaseDeMadeira(u)?1:madeira+1)){
      // volume que o motor assentou no aço real e ninguém mexeu (nem nele, nem nos apoios): vale a conferência do motor
      const doMotor=caibrosDoMotor(u,porId);
      const apoios=doMotor?u.apoioMotor.sobre.map(id=>porId.get(id)).filter(Boolean):itens.filter(b=>b.id!==u.id&&inter(u,b,'x','fx')>1&&inter(u,b,'z','fz')>1&&Math.abs(topo(b)+madeira-u.y)<=2);
      u.sobre=apoios.map(b=>b.id);
      if(u.tipo==='CAIXA') aviso('caixa',u,baseCompativelParaCaixa(u,apoios,itens,madeira)
        ? `Volume ${u.volume}: caixa sobre caixa. Conferir reforço e resistência da embalagem inferior antes de carregar.`
        : `Volume ${u.volume}: caixa sem base compatível para empilhamento. Use o assoalho ou uma caixa maior e mais pesada no piso, sem criar uma terceira camada.`);
      if(!doMotor&&(!coberturaDaBase(u,apoios.filter(b=>!b.baseEmV&&!b.topoVazado&&!temGiroSemBaseConfirmada(b))).suficiente||temGiroSemBaseConfirmada(u)))aviso('apoio',u,`Volume ${u.volume}: a base não tem apoio suficiente identificado na altura escolhida. Reposicione ou confira os apoios reais.`);
      for(const b of apoios){
        if(ordem.get(b.id)>ordem.get(u.id))aviso('ordem',u,`Volume ${u.volume}: o apoio (volume ${b.volume}) deve ser carregado antes dele.`);
        if(b.nadaEmCima||b.classe===3&&!b.emPe)aviso('delicado',u,`Volume ${u.volume}: confira o apoio sobre o volume delicado ${b.volume}.`);
      }
    }
  }
  for(let i=0;i<itens.length;i++)for(let j=i+1;j<itens.length;j++){
    const a=itens[i],b=itens[j];
    // dois volumes no lugar em que o motor os pôs já tiveram o aço conferido: a caixa de um pode cruzar a do outro no vão
    if(noLugarDoMotor(a)&&noLugarDoMotor(b))continue;
    if(inter(a,b,'x','fx')>2&&inter(a,b,'z','fz')>2&&inter(a,b,'y','fy')>2)aviso('colisao',a,`Volumes ${a.volume} e ${b.volume}: áreas ocupadas se sobrepõem. Em peças vazadas, confira o contato real no 3D.`);
  }
  const altura=Math.max(0,...itens.map(topo));
  const usa=itens.length?Math.max(...itens.map(u=>u.x+u.fx))-Math.min(...itens.map(u=>u.x)):0;
  const chao=Math.round(100*itens.filter(u=>noAssoalho(u,madeira)).reduce((s,u)=>s+u.fx*u.fz,0)/(carga.veiculo.C*carga.veiculo.L));
  // quem mexe na montagem muda os vãos: o travamento é refeito sobre as posições editadas
  const trav=travamentoDaCarga(itens,madeira);for(const u of itens){const t=trav.get(u.id);if(t)u.travamento=t;else delete u.travamento;}
  const romaneio=itens.map(u=>{const r=(carga.romaneio||[]).find(v=>v.id===u.id)||{id:u.id,volume:u.volume,rotulo:u.rotulo,pecas:u.membros?.length||1,dimsCm:[u.C,u.L,u.A].map(v=>Math.round(v/10))};const mad=madeiraDaUnidade(u,carga.veiculo);return {...r,travamento:u.travamento||null,madeira:{...pecasDeMadeira(mad),nCaibro:mad.nCaibro,compCaibro:arred(mad.compCaibro)}};});
  return {...carga,itens,passos,altura,usa,chao,camadas:niveis.length,romaneio,madeira:madeiraDaCarga(itens,carga.veiculo),verificacoes,montagemManual:true,alertas:verificacoes.length};
}
const mesmoConjunto=(a,b)=>a.length===b.length&&new Set(b).size===b.length&&a.every(id=>b.includes(id));
export function aplicarEdicaoMontagem(cargas,edicoes,madeira=100) {
  if(!mesmoConjunto(cargas.map((_,i)=>i),edicoes.map(c=>c.indice)))throw new Error('Informe todas as cargas da simulação, sem repetir.');
  return cargas.map((c,indice)=>{
    const ed=edicoes.find(e=>e.indice===indice),ids=c.itens.map(u=>u.id);
    if(!mesmoConjunto(ids,ed.itens.map(u=>u.id)))throw new Error('Os volumes da montagem não correspondem à simulação salva.');
    if(!mesmoConjunto(ids,ed.passos))throw new Error('A sequência deve conter cada volume exatamente uma vez.');
    const porId=new Map(ed.itens.map(u=>[u.id,u]));
    return recalcularMontagem({...c,itens:c.itens.map(u=>ajustarVolume(u,porId.get(u.id))),passos:ed.passos},madeira);
  });
}
export const edicoesDaMontagem = (cargas)=>cargas.map((c,indice)=>({indice,passos:c.passos,itens:c.itens.map(u=>({id:u.id,x:u.x,y:u.y,z:u.z,rotacao:rotacaoDaUnidade(u)}))}));

/** Deslocamento em mm; encaixe relativo preserva a posição ao iniciar o gesto. */
export function posicaoDoArraste(u, delta, veiculo, modo='mover', passo=50, conter=true) {
  const d=limitesRotacionados(u).tamanho;
  const encaixar=v=>passo?Math.round(v/passo)*passo:v;
  const limitar=(v,max)=>arred(conter?Math.max(0,Math.min(Math.max(0,max),v)):Math.max(-50000,Math.min(50000,v)));
  if(modo==='altura')return {x:u.x,z:u.z,y:limitar(u.y+encaixar(delta.y),veiculo.alturaUtil-d.y)};
  return {x:limitar(u.x+encaixar(delta.x),veiculo.C-d.x),y:u.y,z:limitar(u.z+encaixar(delta.z),veiculo.L-d.z)};
}
/** Aviso conservador por caixas envolventes, sem afirmar contato real das peças. */
export function sobreposicaoNoArraste(carga,u,posicao){
 const a={...u,...posicao},da=limitesRotacionados(u).tamanho;
 return carga.itens.some(b=>{
  if(b.id===u.id)return false;
  const db=b.fx&&b.fy&&b.fz?{x:b.fx,y:b.fy,z:b.fz}:limitesRotacionados(b).tamanho;
  return ['x','y','z'].every(e=>Math.min(a[e]+da[e],b[e]+db[e])-Math.max(a[e],b[e])>2);
 });
}

/** Mantém o centro da caixa envolvente ao girar, sem reconstruir membros. */
export function girarVolumeNoCentro(u,rotacao){
 const antes=limitesRotacionados(u).tamanho,depois=limitesRotacionados(u,rotacao).tamanho;
 const pos=Object.fromEntries(['x','y','z'].map(e=>[e,arred(u[e]+(antes[e]-depois[e])/2)]));
 return ajustarVolume(u,{...pos,rotacao});
}
