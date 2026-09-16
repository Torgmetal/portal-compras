import { calcularLqc } from './lqc';
import { categoriaDoItemComercial } from './op-categorias';

/** Prévia somente leitura. Venda contratada e orçamento de compras são independentes. */
export function prepararOpDaLqc(estudo) {
  if (!estudo.orcamento) throw new Error('Vincule a LQC a um orçamento antes de gerar a OP.');
  if (estudo.orcamento.opId) throw new Error('Este orçamento já está vinculado a uma OP.');
  const codigo = `LQC-${String(estudo.numero).padStart(3, '0')}-${String(estudo.ano).slice(-2)}`;
  const r = calcularLqc({...estudo.composicao, demaos: estudo.demaos, preMontagem: estudo.preMontagem});
  const itens = [];
  const adicionar = (categoria, descricao, valor, direto = false, quantidade = null) => {
    if (!(valor > 0)) return;
    itens.push({categoria, tipo:'VERBA', descricao, valorVerba:Math.round(valor*100)/100,
      faturamentoDireto:direto, observacao:`Custo definido na ${codigo}`, unidade:'', qtdContratada:null,
      ...(quantidade?.pesoKg > 0 ? {tipo:'ESTRUTURA',unidade:'KG',qtdContratada:quantidade.pesoKg,cmcMedio:quantidade.precoKg} : {})});
  };
  for (const [chave, categoria, nome] of [
    ['materiaPrima','MATERIA_PRIMA','Perfis e chapas'],
    ['fixadores','PARAFUSOS','Parafusos, porcas e arruelas'],
    ['tintas','TINTA','Tintas e diluentes'],
  ]) {
    for (const l of r.grupos[chave].linhas) adicionar(categoria, `${nome} — ${l.nome}`, l.subtotal, l.faturamentoEscolhido === 'DIRETO', chave === 'materiaPrima' ? l : null);
  }
  for (const l of r.grupos.terceirizados.linhas) adicionar(categoriaDoItemComercial(l.nome), l.nome, l.subtotal, l.faturamentoEscolhido === 'DIRETO');
  for (const l of r.itensComerciais) adicionar(categoriaDoItemComercial(l.nome || l.rotulo), l.nome || l.rotulo, l.subtotal, estudo.composicao?.faturamento?.itensComerciais === 'DIRETO');
  adicionar('OUTRO','Ensaios e inspeções',r.ensaios.total);
  adicionar('SERV_FRETES_ENTREGA','Frete de entrega',r.frete.total,r.frete.faturamento === 'DIRETO');
  adicionar('OUTRO','Embalagens',r.embalagem.total);
  adicionar('OUTRO','Montagem em campo',r.montagem.total);
  return {
    codigo, estudoId:estudo.id, atualizadoEm:new Date(estudo.updatedAt).toISOString(),
    orcamentoId:estudo.orcamento.id, orcamentoRef:estudo.orcamento.numero,
    valorContrato:estudo.orcamento.valor > 0 ? estudo.orcamento.valor : null,
    precoCalculado:r.preco, precoPlanilha:estudo.composicao?.precoPlanilha || null,
    avisos:estudo.composicao?.avisosImportacao || [],
    form:{cliente:estudo.cliente, obra:estudo.obra || '',
      descricao:`Escopo da ${codigo}\n` + r.porArea.filter(a=>a.ativo).map(a=>`${a.area}: ${a.pesoKg.toLocaleString('pt-BR')} kg`).join('\n')},
    itens,
    resumoCustos:{compras:Math.round(itens.reduce((s,i)=>s+i.valorVerba,0)*100)/100,
      internos:r.totais.industrializacao.subtotal,total:r.custo},
    camposPendentes:['Número do pedido e referências do cliente','Data de início e prazo de entrega',
      'Origem do material','Tipo de data book','Escopo de qualidade'],
    estudoDados:{origem:'LQC_PORTAL', estudoFabricacaoId:estudo.id, codigo,
      aco:{pesoKg:r.pesoTotal,areaPinturaM2:r.areaM2},composicao:estudo.composicao,resultado:r},
  };
}
