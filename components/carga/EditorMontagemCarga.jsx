'use client';
import {useEffect,useState,useImperativeHandle} from 'react';
import {Move,RotateCw,Undo2,Save,Loader2,ArrowUp,ArrowDown} from 'lucide-react';
import {ajustarVolume,recalcularMontagem,rotacaoDaUnidade} from '@/lib/carga/montagem-manual';
const btn='min-h-11 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-torg-dark bg-white hover:bg-slate-50 disabled:opacity-40';
const campos=(u)=>({x:String(u.x/10),y:String(u.y/10),z:String(u.z/10),rx:String(rotacaoDaUnidade(u).x),ry:String(rotacaoDaUnidade(u).y),rz:String(rotacaoDaUnidade(u).z)});
export default function EditorMontagemCarga({carga,selecionado,onSelecionar,onAlterar,onSalvar,onDesfazer,onCancelar,podeDesfazer,salvando,apiRef=null}){
 const u=carga.itens.find(i=>i.id===selecionado)||carga.itens[0];
 const [valores,setValores]=useState(()=>u?campos(u):{}),[erro,setErro]=useState('');
 useEffect(()=>{if(u)setValores(campos(u));setErro('');},[u]);

 const montar=(alteracoes={})=>{
  if(!u)throw new Error("Selecione um volume.");
  const v={...valores,...alteracoes};
  if(Object.values(v).some(n=>String(n).trim()===''||!Number.isFinite(Number(n))))throw new Error('Preencha posição e rotação com números.');
  const ed={x:Number(v.x)*10,y:Number(v.y)*10,z:Number(v.z)*10,rotacao:{x:Number(v.rx),y:Number(v.ry),z:Number(v.rz)}};
  if([ed.x,ed.y,ed.z].some(n=>Math.abs(n)>50000)||Object.values(ed.rotacao).some(n=>Math.abs(n)>360))throw new Error('Use posições até 50 m e ângulos entre -360° e 360°.');
  return recalcularMontagem({...carga,itens:carga.itens.map(i=>i.id===u.id?ajustarVolume(i,ed):i)});
 };
 const aplicar=(alteracoes={})=>{try{const c=montar(alteracoes);setErro('');onAlterar(c);}catch(e){setErro(e.message);}};
 const salvar=()=>{try{const c=montar();setErro('');onSalvar(c);}catch(e){setErro(e.message);}};
 const mover=(chave,delta)=>aplicar({[chave]:String(Number(valores[chave])+delta)});
 const girar=(chave)=>aplicar({[chave]:String((Number(valores[chave])+90)%360)});
 const ordenar=(delta)=>{try{const c=montar(),passos=[...c.passos],i=passos.indexOf(u.id),j=i+delta;if(j<0||j>=passos.length)return;[passos[i],passos[j]]=[passos[j],passos[i]];onAlterar(recalcularMontagem({...c,passos}));}catch(e){setErro(e.message);}};
 useImperativeHandle(apiRef,()=>({salvar}));
 if(!u)return null;
 const ordem=carga.passos.indexOf(u.id);
 return <fieldset disabled={salvando} className="min-w-0 rounded-xl border border-torg-blue-200 bg-white p-4 space-y-4">
  <div><h3 className="text-base font-bold text-torg-dark flex gap-2 items-center"><Move size={18}/>Ajustar montagem</h3><p className="mt-1 text-xs text-torg-gray">Arraste no 3D para acomodar. Use os campos abaixo para medidas exatas. Feixes e caixas se movem inteiros.</p></div>
  <label className="block text-sm font-semibold text-torg-dark">Volume<select aria-label="Volume para ajustar" value={u.id} onChange={e=>onSelecionar(e.target.value)} className="w-full h-11 border rounded-lg mt-1 text-sm px-2 font-normal">{carga.itens.map(i=><option key={i.id} value={i.id}>{i.volume} · {[...new Set((i.membros||[]).map(m=>m.marca))].join(', ')||i.rotulo}</option>)}</select></label>
  <p className="text-xs text-torg-gray break-words">{u.rotulo} · {Math.round(u.kg||0).toLocaleString('pt-BR')} kg · {u.membros?.length||1} peça(s)</p>
  <div><h4 className="text-sm font-bold text-torg-dark">Posição em centímetros</h4><p className="text-xs text-torg-gray mt-1">Frente: distância da cabine. Lateral: distância da borda direita (olhando da traseira para a cabine). Altura: acima do piso.</p>
   <div className="grid grid-cols-3 gap-2 mt-2">{[['x','Frente'],['z','Lateral'],['y','Altura']].map(([k,n])=><label className="text-xs text-torg-gray" key={k}>{n}<input aria-label={`${n} em centímetros`} type="number" step="5" value={valores[k]??''} onChange={e=>setValores(v=>({...v,[k]:e.target.value}))} className="w-full h-11 border rounded-lg px-2 mt-1 text-torg-dark"/></label>)}</div>
   <div className="grid grid-cols-2 gap-2 mt-2">{[['x',-10,'À frente −10 cm'],['x',10,'Atrás +10 cm'],['z',-10,'Direita −10 cm'],['z',10,'Esquerda +10 cm'],['y',-10,'Descer −10 cm'],['y',10,'Subir +10 cm']].map(([k,d,t])=><button key={t} type="button" className={`${btn} text-xs`} onClick={()=>mover(k,d)}>{t}</button>)}</div>
   <button type="button" className={`${btn} w-full mt-2`} onClick={()=>aplicar({y:'0'})}>Colocar no piso</button>
  </div>
  <div><h4 className="text-sm font-bold text-torg-dark flex gap-2 items-center"><RotateCw size={16}/>Rotação em graus</h4><div className="grid grid-cols-3 gap-2 mt-2">{[['rx','Deitar'],['ry','Virar'],['rz','Inclinar']].map(([k,n])=><div key={k}><label className="text-xs text-torg-gray">{n}<input aria-label={`${n} em graus`} type="number" step="5" min="-360" max="360" value={valores[k]??''} onChange={e=>setValores(v=>({...v,[k]:e.target.value}))} className="w-full h-11 border rounded-lg px-2 mt-1 text-torg-dark"/></label><button type="button" className={`${btn} w-full mt-1 text-xs px-1`} onClick={()=>girar(k)}>+90°</button></div>)}</div></div>
  <button type="button" className={`${btn} w-full border-torg-blue text-torg-blue`} onClick={()=>aplicar()}>Aplicar medidas digitadas</button>
  <div className="border-t pt-3"><p className="text-sm font-bold text-torg-dark">Ordem de carregamento: {ordem+1} de {carga.passos.length}</p><div className="grid grid-cols-2 gap-2 mt-2"><button type="button" className={btn} disabled={ordem<=0} onClick={()=>ordenar(-1)}><ArrowUp size={14} className="inline mr-1"/>Antes</button><button type="button" className={btn} disabled={ordem>=carga.passos.length-1} onClick={()=>ordenar(1)}><ArrowDown size={14} className="inline mr-1"/>Depois</button></div></div>
  {erro&&<p role="alert" className="text-sm text-red-700">{erro}</p>}
  <div className="grid grid-cols-2 gap-2"><button type="button" className={btn} disabled={!podeDesfazer} onClick={onDesfazer}><Undo2 size={15} className="inline mr-1"/>Desfazer</button><button type="button" className={btn} onClick={onCancelar}>Cancelar edição</button><button type="button" onClick={salvar} className="col-span-2 min-h-11 rounded-lg bg-torg-blue text-white font-semibold flex justify-center items-center gap-2 disabled:opacity-50">{salvando?<Loader2 size={17} className="animate-spin"/>:<Save size={17}/>}Salvar montagem</button></div>
 </fieldset>;
}
