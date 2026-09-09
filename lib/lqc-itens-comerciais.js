export const COMPLEMENTOS_TELHAS = [
 {key:'parafusos',nome:'Parafusos',unidades:['un','caixa']},
 {key:'laRocha',nome:'Lã de rocha',unidades:['m²']},
 {key:'vedaOnda',nome:'Veda-onda',unidades:['un','m']},
 {key:'fitaVedacao',nome:'Fita de vedação',unidades:['m','rolo']},
 {key:'siliconePu',nome:'Silicone PU',unidades:['un','tubo','cartucho']},
];
const ITENS = [{key:'silicone',nome:'Silicone',unidades:['un','tubo','cartucho']},{key:'parafusos',nome:'Parafusos',unidades:['un','caixa']},{key:'fixadores',nome:'Fixadores',unidades:['un','caixa']}];

export const CONFIG = {
 'Linha de vida':{itens:[{key:'pilaretes',nome:'Pilaretes',unidades:['un']},{key:'fixadores',nome:'Fixadores',unidades:['un','caixa']},{key:'cabosAco',nome:'Cabos de aço',unidades:['m','rolo']},{key:'acessorios',nome:'Acessórios',unidades:['un','conjunto']}],frete:true},
 'Calhas': {itens:ITENS}, 'Rufos':{itens:ITENS},
 'Grades de piso':{itens:[{key:'grampos',nome:'Grampos de fixação',unidades:['un','caixa']}],frete:true},
 'Steel deck':{itens:[{key:'studbolts',nome:'Studbolts',unidades:['un','caixa']},{key:'arremates',nome:'Arremates',unidades:['m','un']},{key:'fixadores',nome:'Fixadores',unidades:['un','caixa']}],frete:true},
 'Lanternim':{itens:[],frete:true,montagem:true}, 'Domos':{itens:[],frete:true}, 'Venezianas':{itens:[],frete:true},
};
export const FAMILIAS = ['Telhas','Calhas','Rufos','Grades de piso','Steel deck','Lanternim','Domos','Venezianas','Linha de vida'];
export const UNIDADE_FAMILIA = {Telhas:'m²',Calhas:'m',Rufos:'m','Grades de piso':'m²','Steel deck':'m²',Lanternim:'m',Domos:'un',Venezianas:'m²','Linha de vida':'m'};
const FAMILIA_LEGADA = {TELHA_TERMO:'Telhas',TELHA_SIMPLES:'Telhas',CALHAS:'Calhas',RUFOS:'Rufos',GRADE_PISO:'Grades de piso',STEEL_DECK:'Steel deck',LANTERNIM:'Lanternim',DOMOS:'Domos',VENEZIANAS:'Venezianas',LINHA_VIDA:'Linha de vida'};
const CHAVE_FAMILIA = {Telhas:'TELHA_SIMPLES',Calhas:'CALHAS',Rufos:'RUFOS','Grades de piso':'GRADE_PISO','Steel deck':'STEEL_DECK',Lanternim:'LANTERNIM',Domos:'DOMOS',Venezianas:'VENEZIANAS','Linha de vida':'LINHA_VIDA'};
function numeroDecimal(v) {
 const x=Number(String(v??'').replace(',','.'));
 return Number.isFinite(x)?x:0;
}
export const numeroCompra=v=>Math.max(0,numeroDecimal(v));
// Valores antigos usam a notação brasileira aceita pelo motor original.
function numeroLegado(v) {
 if(typeof v==='number')return Number.isFinite(v)?v:0;
 let s=String(v??'').trim();
 if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');
 else if(/^-?\d{1,3}(\.\d{3})+$/.test(s))s=s.replace(/\./g,'');
 const x=Number(s.replace(/[^\d.eE+-]/g,''));
 return Number.isFinite(x)?x:0;
}
const r2=n=>Math.round(n*100)/100;
export const configFamilia=f=>f==='Telhas'?{itens:COMPLEMENTOS_TELHAS,frete:true}:(CONFIG[f]||{itens:[]});
export function custoComplementos(dados={},familia) {
 const cfg=configFamilia(familia);
 return cfg.itens.reduce((s,i)=>s+numeroCompra(dados[i.key]?.quantidade)*numeroCompra(dados[i.key]?.custoUnitario),0)
  +(cfg.frete?numeroCompra(dados.frete):0)+(cfg.montagem?numeroCompra(dados.montagem):0);
}
export function quantidadeModelo(modelo,areasAtivas) {
 const porArea=modelo.porArea||{};
 return Object.values(porArea).some(v=>numeroDecimal(v)>0)
  ?Object.entries(porArea).reduce((s,[ar,v])=>s+(areasAtivas.has(ar)?numeroDecimal(v):0),0)
  :modelo.chaveLegada?numeroDecimal(modelo.quantidade):numeroCompra(modelo.quantidade);
}
/** A migração é persistida somente ao editar; cada chave antiga conserva sua própria linha. */
export function migrarItensComerciais(c={},catalogo=[]) {
 if(c.comerciaisCompra?.versao===1)return c.comerciaisCompra;
 const modelos={},legados=[];
 for(const item of catalogo){
  const cfg=c.itensComerciais?.[item.key];if(!cfg)continue;
  const m={...cfg,id:`legado:${item.key}`,chaveLegada:item.key,nome:cfg.nome||item.rotulo||item.nome,unidade:cfg.unidade||item.un,
   quantidade:numeroLegado(cfg.qtd),custoUnitario:cfg.preco==null?item.preco:numeroLegado(cfg.preco),especificacao:cfg.especificacao||cfg.obs||'',
   ...(cfg.porArea?{porArea:Object.fromEntries(Object.entries(cfg.porArea).map(([a,v])=>[a,numeroLegado(v)]))}:{})};
  const familia=FAMILIA_LEGADA[item.key];
  if(familia)(modelos[familia]??=[]).push(m);else legados.push(m);
 }
 return {versao:1,modelos,complementos:{},legados};
}
/** Linhas de custo para o motor, montagem e resumo. Frete da família aparece uma única vez. */
export function calcularItensComerciais(c={},catalogo=[],areasAtivas=new Set(),{escopoParcial=false}={}) {
 const compra=migrarItensComerciais(c,catalogo);
 const linhas=[];
 const adicionarModelo=(m,familia,index)=>{
  const qtd=quantidadeModelo(m,areasAtivas);
  const preco=m.chaveLegada?numeroDecimal(m.custoUnitario):numeroCompra(m.custoUnitario);
  const porArea=m.porArea||{};
  const temPorArea=Object.values(porArea).some(v=>numeroDecimal(v)>0);
  const nome=m.nome||familia||m.chaveLegada;
  linhas.push({key:m.chaveLegada||CHAVE_FAMILIA[familia],id:m.id||`${familia}:${index}`,nome,rotulo:nome,un:m.unidade||UNIDADE_FAMILIA[familia]||'un',
   qtd:r2(qtd),preco,subtotal:r2(qtd*preco),porArea,porAreaTotal:temPorArea,naoAcompanha:!temPorArea&&qtd>0&&escopoParcial,familia,tipo:'principal',cor:m.cor||'',especificacao:m.especificacao||'',codigoOmie:m.codigoOmie||''});
 };
 for(const familia of FAMILIAS){
  (compra.modelos?.[familia]||[]).forEach((m,index)=>adicionarModelo(m,familia,index));
  const dados=compra.complementos?.[familia]||{},cfg=configFamilia(familia);
  for(const item of cfg.itens){
   const v=dados[item.key]||{},qtd=numeroCompra(v.quantidade),preco=numeroCompra(v.custoUnitario);
   linhas.push({key:`COMP:${CHAVE_FAMILIA[familia]}:${item.key}`,nome:`${familia} · ${item.nome}`,rotulo:`${familia} · ${item.nome}`,un:v.unidade||item.unidades[0],qtd,preco,subtotal:r2(qtd*preco),familia,tipo:'complemento'});
  }
  for(const tipo of ['frete','montagem'])if(cfg[tipo]){
   const preco=numeroCompra(dados[tipo]);
   linhas.push({key:`COMP:${CHAVE_FAMILIA[familia]}:${tipo}`,nome:`${familia} · ${tipo==='frete'?'Frete':'Montagem'}`,rotulo:`${familia} · ${tipo==='frete'?'Frete':'Montagem'}`,un:'vb',qtd:preco>0?1:0,preco,subtotal:r2(preco),familia,tipo});
  }
 }
 (compra.legados||[]).forEach((m,index)=>adicionarModelo(m,null,index));
 return linhas.filter(i=>i.qtd>0||i.subtotal>0);
}
