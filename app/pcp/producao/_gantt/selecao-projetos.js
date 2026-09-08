const norm = (v) => String(v || '').trim().toLocaleUpperCase('pt-BR');
export const escapar = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function filtrarProjetos(itens, { busca='', perfil='', material='', soFalta=false }={}) {
  return itens.filter(i => (!busca || norm([i.m,i.pf,i.mt].join(' ')).includes(norm(busca)))
    && (!perfil || (perfil==='__SEM__' ? !i.pf : i.pf===perfil))
    && (!material || (material==='__SEM__' ? !i.mt : i.mt===material))
    && (!soFalta || !i.g));
}
const somar = (itens) => ({itens,pecas:itens.reduce((s,i)=>s+i.q,0),kg:itens.reduce((s,i)=>s+i.kg,0),custo:itens.reduce((s,i)=>s+(i.c||0),0),feitas:itens.reduce((s,i)=>s+(i.f||0),0)});
export function recortarProgramacao(r, ids) {
  const itens=r.itens.filter(i=>ids.has(i.id));
  const dividir=(dentro)=>r.lotes.map(l=>({...l,...somar(l.itens.filter(i=>ids.has(i.id)===dentro))})).filter(l=>l.itens.length);
  return {...r,...somar(itens),lotes:dividir(true),restantes:dividir(false),parcial:itens.length!==r.itens.length};
}
