import { escapar } from './selecao-projetos';

// Rascunho independente: pesquisar ou cancelar não altera a lista nem sua seleção.
export function abrirFiltroColuna({raiz,botao,campo,itens,valores,aplicar}) {
  const opcoes=[...new Set([...itens.map(i=>i[campo]||'__SEM__'),...(valores||[])])].sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true}));
  const escolhidos=new Set(valores??opcoes);
  const titulo={m:'Marca',pf:'Perfil',mt:'Material / aço'}[campo];
  const dlg=document.createElement('dialog');
  dlg.className='filtro-excel'; dlg.setAttribute('aria-label','Filtrar '+titulo);
  dlg.innerHTML='<header><b>Filtrar '+titulo+'</b><button type="button" data-fechar aria-label="Fechar filtro">×</button></header>'
    +'<input type="search" aria-label="Pesquisar valores" placeholder="Pesquisar…">'
    +'<label class="todos"><input type="checkbox" data-todos> Selecionar todos os resultados</label>'
    +'<div class="valores"></div><div class="contagem" aria-live="polite"></div>'
    +'<footer><button class="btn mini" data-limpar>Limpar filtro</button><button class="btn mini" data-cancelar>Cancelar</button><button class="btn mini pri" data-aplicar>Aplicar</button></footer>';
  raiz.appendChild(dlg);
  const busca=dlg.querySelector('input[type=search]'), lista=dlg.querySelector('.valores'), todos=dlg.querySelector('[data-todos]');
  const resultados=()=>opcoes.filter(v=>(v==='__SEM__'?'Não informado':v).toLocaleLowerCase('pt-BR').includes(busca.value.trim().toLocaleLowerCase('pt-BR')));
  const atualizar=()=>{
    const vs=resultados(), n=vs.filter(v=>escolhidos.has(v)).length;
    todos.checked=vs.length>0&&n===vs.length; todos.indeterminate=n>0&&n<vs.length; todos.disabled=!vs.length;
    dlg.querySelector('.contagem').textContent=escolhidos.size+' de '+opcoes.length+' valores selecionados';
  };
  const pintar=()=>{
    lista.innerHTML=resultados().map(v=>'<label><input type="checkbox" value="'+escapar(v)+'"'+(escolhidos.has(v)?' checked':'')+'> <span>'+escapar(v==='__SEM__'?'Não informado':v)+'</span></label>').join('')||'<p>Nenhum valor encontrado.</p>';
    for(const ck of lista.querySelectorAll('input')) ck.onchange=()=>{if(ck.checked) escolhidos.add(ck.value); else escolhidos.delete(ck.value); atualizar();};
    atualizar();
  };
  busca.oninput=pintar;
  todos.onchange=()=>{for(const v of resultados()) {if(todos.checked) escolhidos.add(v);else escolhidos.delete(v);} pintar();};
  dlg.querySelector('[data-fechar]').onclick=dlg.querySelector('[data-cancelar]').onclick=()=>dlg.close();
  dlg.querySelector('[data-limpar]').onclick=()=>{dlg.close();aplicar(null);};
  dlg.querySelector('[data-aplicar]').onclick=()=>{dlg.close();aplicar(escolhidos.size===opcoes.length&&opcoes.length>0?null:[...escolhidos]);};
  dlg.onclick=e=>{if(e.target===dlg){const r=dlg.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom) dlg.close();}};
  dlg.onclose=()=>{dlg.remove();if(botao.isConnected) botao.focus();};
  pintar(); dlg.showModal();
  const r=botao.getBoundingClientRect();
  dlg.style.left=Math.max(8,Math.min(r.left,window.innerWidth-dlg.offsetWidth-8))+'px';
  dlg.style.top=Math.max(8,Math.min(r.bottom+6,window.innerHeight-dlg.offsetHeight-8))+'px';
  busca.focus();
}
