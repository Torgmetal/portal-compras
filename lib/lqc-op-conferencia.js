const moeda = n => Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toUpperCase();

/** Compara o custo definido, sem recalculá-lo a partir de referências do projeto maior. */
export function conferirCustosLqc(previa, dados) {
  const r = previa.estudoDados.resultado;
  const grupos = dados.custos?.grupos || [];
  const fonte = codigo => grupos.find(g=>String(g.item) === codigo)?.subtotal;
  const linhas = [];
  const adicionar = (chave, nome, portal, planilha, unidade='BRL') => {
    const p=moeda(portal), f=moeda(planilha);
    const diferenca=p == null || f == null ? null : moeda(p-f);
    const status=diferenca == null ? 'ausente' : diferenca === 0 ? 'confere' : Math.abs(diferenca)<=.01 ? 'arredondamento' : 'divergente';
    linhas.push({chave,nome,portal:p,planilha:f,diferenca,status,unidade});
  };
  adicionar('peso','Peso do escopo',r.pesoTotal,dados.aco?.pesoKg,'KG');
  for (const [chave,codigo,nome] of [
    ['materiaPrima','1.1','Matéria-prima'],['fixadores','1.2','Fixadores'],['tintas','1.3','Tintas'],
    ['terceirizados','2','Serviços terceirizados'],['fabricacao','3.1','Fabricação interna'],
    ['pintura','3.2','Pintura interna'],['preMontagem','3.3','Pré-montagem interna'],
  ]) adicionar(chave,nome,r.grupos[chave].total.subtotal,fonte(codigo));
  const basePortal = r.totais.material.subtotal + r.totais.mdo.subtotal + r.totais.industrializacao.subtotal;
  const totalComercial = dados.comercial?.totalGeral;
  const colunasCusto = ['material','mdoTerceirizada','industrializacao'];
  const custoCompleto = totalComercial && colunasCusto.every(k=>Number.isFinite(totalComercial[k]))
    ? colunasCusto.reduce((s,k)=>s+totalComercial[k],0) : null;
  const extrasPortal = moeda(r.custo-basePortal);
  if (extrasPortal !== 0 || (custoCompleto != null && moeda(custoCompleto-dados.custos?.total) !== 0))
    adicionar('extras','Demais custos do escopo',extrasPortal,custoCompleto == null || !Number.isFinite(dados.custos?.total) ? null : custoCompleto-dados.custos.total);
  adicionar('custo','Custo total',r.custo,custoCompleto ?? (extrasPortal === 0 ? dados.custos?.total : null));
  // Também confere as áreas: somas iguais podem ocultar uma OS ou um rateio errado.
  const porNome = (lista, campo, valor) => {
    const mapa=new Map();
    for(const l of lista || []) {const k=norm(l[campo]);mapa.set(k,(mapa.get(k)||0)+(Number(l[valor])||0));}
    return mapa;
  };
  const areasPortal=porNome(r.porArea.filter(a=>a.ativo),'area','pesoKg');
  const areasArquivo=porNome(dados.aco?.itens,'area','pesoKg');
  for(const area of new Set([...areasPortal.keys(),...areasArquivo.keys()]))
    adicionar(`area:${area}`,`Peso — ${area}`,areasPortal.get(area),areasArquivo.get(area),'KG');
  const acoPortal=porNome(r.grupos.materiaPrima.linhas.filter(l=>l.subtotal>0),'nome','subtotal');
  const acoArquivo=porNome(grupos.find(g=>String(g.item)==='1.1')?.itens,'descricao','subtotal');
  for(const nome of new Set([...acoPortal.keys(),...acoArquivo.keys()]))
    adicionar(`aco:${nome}`,`Aço — ${nome}`,acoPortal.get(nome),acoArquivo.get(nome));
  for (const [chave,prefixo,nomeGrupo] of [['terceirizados','2.','Serviço'],['fabricacao','3.1','Fabricação'],['pintura','3.2','Pintura'],['preMontagem','3.3','Pré-montagem']]) {
    const selecionados=grupos.filter(g=>String(g.item).startsWith(prefixo));
    const itensFonte=selecionados.flatMap(g=>g.itens?.length ? g.itens : (g.subtotal>0 ? [g] : []));
    const portal=porNome(r.grupos[chave].linhas.filter(l=>l.subtotal>0),'nome','subtotal');
    const arquivo=porNome(itensFonte.filter(l=>l.subtotal>0),'descricao','subtotal');
    for (const nome of new Set([...portal.keys(),...arquivo.keys()]))
      adicionar(`${chave}:${nome}`,`${nomeGrupo} — ${nome}`,portal.get(nome),arquivo.get(nome));
  }
  return {ok:linhas.every(l=>['confere','arredondamento'].includes(l.status)),linhas};
}

const camposCusto=['categoria','tipo','descricao','valorVerba','faturamentoDireto','unidade','qtdContratada','cmcMedio'];
export function validarPreenchimentoLqc(previa, body) {
  if (!previa.conferencia?.ok) throw new Error('Resolva a conferência da planilha antes de criar a OP.');
  if (!body.conferenciaCodigo || body.conferenciaCodigo !== previa.conferencia.codigo)
    throw new Error('A fonte da LQC mudou. Reabra a prévia e confira os dados.');
  if (previa.valorContrato > 0 && moeda(body.valorContrato) !== moeda(previa.valorContrato))
    throw new Error('O valor contratado mudou. Confira o orçamento e reabra a prévia.');
  if (body.itens?.length !== previa.itens.length || previa.itens.some((item,i)=>camposCusto.some(k=>(item[k] ?? null) !== (body.itens[i]?.[k] ?? null))))
    throw new Error('Os custos ou quantitativos diferem da LQC. Ajuste o estudo e reabra a prévia.');
}
