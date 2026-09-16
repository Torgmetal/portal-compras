const normalizar = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const tituloLimpo = v => normalizar(v).replace(/^\d+(?:\.\d+)*[.)]?\s*/, '').replace(/[:.]$/, '');
const TITULOS = ['Escopo','Descrição da obra','Pré-montagem','Modularização','Normas utilizadas','Normas aplicáveis','Elaborações dos projetos','Elaboração dos projetos','Escopo e Premissas do Cálculo Estrutural','Anotação da responsabilidade técnica','Materiais empregados','Tratamento de superfície','Garantias','Considerações gerais','Controle de qualidade','Prazo de execução','Inclusos','Exclusos','Responsabilidades da contratante'];
const titulos = new Map(TITULOS.map(t=>[normalizar(t),t]));
const financeiro = /r\s*\$|us\s*\$|€|\d[\d.]*,\d{2}(?!\d)|\b(?:precos?|precific\w*|pagamentos?|fatur\w*|tribut\w*|impostos?|icms|ipi|bdi|lucro|margem|reais|parcelas?|investimento|saldo|entrada|reajust\w*|custos?|financeir\w*)\b|valor(?:es)?\s+(?:total|unitario|contratado|da proposta)|condicoes comerciais/;
const fim = /^(?:investimento|valor da proposta|proposta comercial|premissas comerciais|planilha de quantidade|condicoes comerciais|condicoes de pagamento|precos?|revisao de precos|validade da proposta|atenciosamente|sendo o que se apresenta)/;

export function ordenarPropostasConsulta(arquivos) {
 return arquivos.map(a=>{
  const nome=String(a.nome||a.name||'');
  if(!/\.(pdf|docx)$/i.test(nome)||/^~\$/.test(nome)||/\b(?:PTC?|PC)[-_ ]*0+(?:[-_ ]|\.)/i.test(nome)||/\b(?:modelo|template)\b/i.test(nome))return null;
  const n=normalizar(nome);
  const tipo=/^pt(?:c)?[-_ ]/i.test(nome)||a.tecnica===true||n.includes('proposta tecnica')?'TECNICA':/^pc[-_ ]/i.test(nome)||a.comercial===true||n.includes('proposta comercial')?'COMERCIAL':null;
  if(!tipo)return null;
  return {...a,nome,tipo,revisao:Number(nome.match(/[-_ ]R(\d+)/i)?.[1]||0)};
 }).filter(Boolean).sort((a,b)=>(a.tipo==='TECNICA'?0:1)-(b.tipo==='TECNICA'?0:1)||b.revisao-a.revisao||String(b.modificado||b.lastModifiedDateTime||'').localeCompare(String(a.modificado||a.lastModifiedDateTime||'')));
}

// Lista positiva de seções. Conteúdo não reconhecido nunca vira um documento bruto no navegador.
// O texto é apresentado como texto React, nunca como HTML do arquivo.
export function prepararConsultaProposta(texto) {
 const secoes=[];let atual=null,omissoes=false;
 for(const bruto of String(texto||'').split(/\r?\n/)){
  const linha=bruto.trim();if(!linha)continue;
  const chave=tituloLimpo(linha),titulo=titulos.get(chave);
  if(titulo){atual={titulo,paragrafos:[]};secoes.push(atual);continue;}
  if(fim.test(chave)){atual=null;omissoes=true;continue;}
  if(!atual)continue;
  if(financeiro.test(normalizar(linha))){omissoes=true;continue;}
  // Colunas numéricas isoladas não são uma leitura confiável de tabela PDF.
  if(/^[\d\s.,%+-]+$/.test(linha)){omissoes=true;continue;}
  atual.paragrafos.push(linha);
 }
 return {secoes:secoes.filter(s=>s.paragrafos.length),omissoes};
}

// Somente uma leitura conferida da MESMA versão pode chegar aos setores.
// A extração acima produz um rascunho para conferência, nunca uma autorização automática.
export function consultaConferida(arquivo, hash) {
 const c=arquivo?.consultaObra;
 if(c?.versao!==1 || c.sha256!==hash || !c.conferidoEm || !c.conferidoPor || !Array.isArray(c.secoes) || !c.secoes.length)return null;
 if(c.secoes.some(s=>typeof s.titulo!=='string'||!Array.isArray(s.paragrafos)||s.paragrafos.some(p=>typeof p!=='string')))return null;
 return {secoes:c.secoes.map(s=>({titulo:s.titulo,paragrafos:[...s.paragrafos]})),conferidoEm:c.conferidoEm,omissoes:true};
}
