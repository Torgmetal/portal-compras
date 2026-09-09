"use client";
import React, { useState } from 'react';
import { Plus, ChevronRight, X } from 'lucide-react';
import { FAMILIAS, UNIDADE_FAMILIA as PADRAO, configFamilia, quantidadeModelo, migrarItensComerciais, calcularItensComerciais, numeroCompra as numero } from '@/lib/lqc-itens-comerciais';
import { ITENS_COMERCIAIS, FATURAMENTO, FATURAMENTO_ROTULO } from '@/lib/lqc';
import { Sel } from './campos';
import { QuantidadePorArea } from './QuantidadeComercialPorArea';
import s from './ItensComerciais.module.css';
const UNIDADES=['m²','m','un','kg','conjunto','caixa','rolo'];
const moeda=v=>v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export function ItensComerciais({c,res,setComp,estudoId}){
 const [familia,setFamilia]=useState('Telhas');
 const compra=migrarItensComerciais(c,ITENS_COMERCIAIS);
 const modelos=compra.modelos||{};
 const areasAtivas=new Set((c.resumos||[]).filter(l=>l.ativo!==false).map(l=>l.area||l.item).filter(Boolean));
 const salvar=patch=>setComp({comerciaisCompra:{...compra,...patch}});
 const setModelos=fn=>salvar({modelos:fn(modelos)});
 const linhasDe=f=>modelos[f]?.length?modelos[f]:[{}];
 const linhas=calcularItensComerciais(c,ITENS_COMERCIAIS,areasAtivas);
 const custoItens=f=>linhas.filter(l=>l.familia===f&&l.tipo==='principal').reduce((n,l)=>n+l.subtotal,0);
 const custoExtras=f=>linhas.filter(l=>l.familia===f&&l.tipo!=='principal').reduce((n,l)=>n+l.subtotal,0);
 const totalFamilia=f=>custoItens(f)+custoExtras(f);
 const total=linhas.reduce((n,l)=>n+l.subtotal,0);
 const config=configFamilia(familia);
 const dados=compra.complementos?.[familia]||{};
 const setDados=fn=>salvar({complementos:{...compra.complementos,[familia]:fn(dados)}});
 const atualizarModelo=(index,patch)=>setModelos(atual=>({...atual,[familia]:(atual[familia]?.length?atual[familia]:[{}]).map((m,i)=>i===index?{...m,id:m.id||crypto.randomUUID(),...patch}:m)}));
 const atualizar=(index,chave,valor)=>atualizarModelo(index,{[chave]:valor});
 const atualizarExtra=(key,chave,valor)=>setDados(atual=>({...atual,[key]:{...(atual[key]||{}),[chave]:valor}}));
 return <div className={s.composicao}>
  <label className={s.faturamento}>Quem fatura os itens comerciais
   <Sel value={c.faturamento?.itensComerciais||''} opcoes={FATURAMENTO} rotulos={FATURAMENTO_ROTULO} onChange={e=>setComp({faturamento:{...c.faturamento,itensComerciais:e.target.value}})}/>
  </label>
  <div className={s.resumoGeral}><div><span className={s.eyebrow}>Composição de compra</span><p>Preencha o item principal e os complementos da família.</p></div><div className={s.totalGeral}><span>Total dos itens comerciais</span><strong data-testid="total-comerciais">{moeda(total)}</strong><small>Antes de impostos e BDI</small></div></div>
  <div className={s.workspace}>
   <nav className={s.familias} aria-label="Famílias de itens comerciais"><span className={s.rotuloMenu}>Famílias</span>{FAMILIAS.map(f=><button key={f} type="button" aria-current={f===familia?'page':undefined} onClick={()=>setFamilia(f)}><span><strong>{f}</strong><small>{totalFamilia(f)>0?moeda(totalFamilia(f)):'Sem custo lançado'}</small></span><ChevronRight size={15}/></button>)}</nav>
   <section className={s.ficha} aria-label={`Composição de ${familia}`}>
    <header className={s.cabecalho}><div><span className={s.eyebrow}>Itens comerciais</span><h3>{familia}</h3></div><div><span>Custo da família</span><strong data-testid="total-familia">{moeda(totalFamilia(familia))}</strong></div></header>
    <div className={s.conteudo}>
     <div className={s.secaoTitulo}><div><span className={s.numero}>01</span><h4>Item principal</h4></div><button type="button" onClick={()=>setModelos(atual=>({...atual,[familia]:[...(atual[familia]?.length?atual[familia]:[{}]),{id:crypto.randomUUID()}]}))}><Plus size={14}/>Adicionar outro modelo</button></div>
     <p className={s.ajuda}>Informe quantidade e custo diretamente. O nome do modelo pode ser preenchido depois.</p>
     <div className={s.principais}>{linhasDe(familia).map((m,index)=><div key={m.id||index} className={s.modelo}>
      <div className={s.linhaPrincipal}>
       <label>Quantidade<input aria-label={`Quantidade do item ${index+1} de ${familia}`} type="number" min="0" step="any" placeholder="0" disabled={Object.values(m.porArea||{}).some(v=>Number(String(v).replace(',','.'))>0)} value={Object.values(m.porArea||{}).some(v=>Number(String(v).replace(',','.'))>0)?quantidadeModelo(m,areasAtivas):(m.quantidade??'')} onChange={e=>atualizar(index,'quantidade',e.target.value)}/></label>
       <label>Custo unit. (R$)<input aria-label={`Custo unitário do item ${index+1} de ${familia}`} type="number" min="0" step="0.01" placeholder="0,00" value={m.custoUnitario??''} onChange={e=>atualizar(index,'custoUnitario',e.target.value)}/></label>
       <label>Unidade<select aria-label={`Unidade do item ${index+1} de ${familia}`} value={m.unidade||PADRAO[familia]} onChange={e=>atualizar(index,'unidade',e.target.value)}>{UNIDADES.map(u=><option key={u}>{u}</option>)}</select></label>
       <label>Item / modelo<input aria-label={`Modelo ${index+1} de ${familia}`} placeholder={`${familia} — informar modelo`} value={m.nome??''} onChange={e=>atualizar(index,'nome',e.target.value)}/></label>
       <div className={s.subtotal}><span>Subtotal</span><strong>{moeda(linhas.find(l=>l.id===(m.id||`${familia}:${index}`))?.subtotal||0)}</strong></div>
      </div>
      <QuantidadePorArea modelo={m} areasAtivas={areasAtivas} onChange={patch=>atualizarModelo(index,patch)}/>
      <div className={s.detalhesModelo}>
       {m.codigoOmie && <span className={s.ajuda}>Código salvo: {m.codigoOmie}</span>}
       {(familia==='Telhas'||m.cor) && <label>{familia==='Telhas'?'Cor da telha':'Cor'}<input aria-label={`Cor do item ${index+1} de Telhas`} placeholder="Cor / referência" value={m.cor??''} onChange={e=>atualizar(index,'cor',e.target.value)}/></label>}
       <details><summary>Especificação / observações</summary><input aria-label={`Especificação do item ${index+1} de ${familia}`} value={m.especificacao??''} placeholder="Medidas, material ou variação do modelo" onChange={e=>atualizar(index,'especificacao',e.target.value)}/></details>
       {linhasDe(familia).length>1 && <button type="button" aria-label={`Remover modelo ${index+1} de ${familia}`} onClick={()=>setModelos(atual=>({...atual,[familia]:atual[familia].filter((_,i)=>i!==index)}))}><X size={14}/>Remover</button>}
      </div>
     </div>)}</div>
     <div className={s.secaoTitulo}><div><span className={s.numero}>02</span><h4>Complementos{config.frete?' e serviços':''}</h4></div><span className={s.opcional}>Preencha apenas o que será utilizado</span></div>
     <div className={s.complementos}>
      {config.itens.map(item=>{const v=dados[item.key]||{};const un=v.unidade||item.unidades[0];return <div key={item.key} className={s.linhaExtra}>
       <span className={s.nomeExtra}>{item.nome}</span>
       <label><span className={s.labelExtra}>Unidade</span>{item.unidades.length===1?<span className={s.unidadeFixa}>{un}</span>:<select aria-label={`Unidade de ${item.nome} em ${familia}`} value={un} onChange={e=>atualizarExtra(item.key,'unidade',e.target.value)}>{item.unidades.map(u=><option key={u}>{u}</option>)}</select>}</label>
       <label><span className={s.labelExtra}>{item.key==='laRocha'?'Área (m²)':'Quantidade'}</span><input aria-label={`Quantidade de ${item.nome} em ${familia}`} type="number" min="0" step="any" placeholder="0" value={v.quantidade??''} onChange={e=>atualizarExtra(item.key,'quantidade',e.target.value)}/></label>
       <label><span className={s.labelExtra}>Custo (R$/{un})</span><input aria-label={`Custo unitário de ${item.nome} em ${familia}`} type="number" min="0" step="0.01" placeholder="0,00" value={v.custoUnitario??''} onChange={e=>atualizarExtra(item.key,'custoUnitario',e.target.value)}/></label>
       <div className={s.subtotal}><span>Subtotal</span><strong>{moeda(numero(v.quantidade)*numero(v.custoUnitario))}</strong></div>
      </div>;})}
      {(config.frete||config.montagem)&&<div className={s.servicos}>
       {config.frete&&<label>Frete · valor total (R$)<input aria-label={`Frete de ${familia}`} type="number" min="0" step="0.01" placeholder="0,00" value={dados.frete??''} onChange={e=>setDados(atual=>({...atual,frete:e.target.value}))}/></label>}
       {config.montagem&&<label>Montagem · valor total (R$)<input aria-label={`Montagem de ${familia}`} type="number" min="0" step="0.01" placeholder="0,00" value={dados.montagem??''} onChange={e=>setDados(atual=>({...atual,montagem:e.target.value}))}/></label>}
      </div>}
     </div>
    </div>
    <footer className={s.rodape}><div><span>Itens principais</span><strong>{moeda(custoItens(familia))}</strong></div><span className={s.sinal}>+</span><div><span>Complementos e serviços</span><strong>{moeda(custoExtras(familia))}</strong></div><div className={s.totalFinal}><span>Total · {familia}</span><strong>{moeda(totalFamilia(familia))}</strong></div></footer>
    <p className={s.nota}>Custos de compra, sem margem adicional. Impostos e BDI serão tratados na etapa própria.</p>
   </section>
  </div>
  {!!compra.legados?.length && <section className={s.legados} aria-label="Itens anteriores preservados"><h3>Itens anteriores preservados</h3><p>Os itens já lançados continuam no orçamento.</p>{compra.legados.map((m,index)=>{
   const atualizarLegado=patch=>salvar({legados:compra.legados.map((v,i)=>i===index?{...v,...patch}:v)});
   const porArea=Object.values(m.porArea||{}).some(v=>Number(String(v).replace(',','.'))>0);
   return <div className={s.modelo} key={m.id}><strong>{m.nome}</strong><div className={s.servicos}>
    <label>Quantidade ({m.unidade})<input aria-label={`Quantidade de ${m.nome}`} type="number" min="0" step="any" disabled={porArea} value={quantidadeModelo(m,areasAtivas)} onChange={e=>atualizarLegado({quantidade:e.target.value})}/></label>
    <label>Custo unitário (R$)<input aria-label={`Custo unitário de ${m.nome}`} type="number" min="0" step="any" value={m.custoUnitario??''} onChange={e=>atualizarLegado({custoUnitario:e.target.value})}/></label>
   </div><QuantidadePorArea modelo={m} areasAtivas={areasAtivas} onChange={atualizarLegado}/>
   {m.codigoOmie&&<p>Código salvo: {m.codigoOmie}</p>}{m.especificacao&&<p>{m.especificacao}</p>}</div>;
  })}</section>}
 </div>;
}
