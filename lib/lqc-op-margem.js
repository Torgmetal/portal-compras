const dinheiro = (valor) => Math.round((valor + Number.EPSILON) * 100) / 100;
const numero = (valor) => typeof valor === 'number' && Number.isFinite(valor) && valor >= 0;

/** Contrato base atual × custos e reservas orçados; não representa resultado realizado. */
export function margemOrcadaLqc(op) {
  const dados = op?.estudoDados;
  if (dados?.origem !== 'LQC_PORTAL') return null;
  const pendente = { valido: false, codigo: dados.codigo, motivo: 'Custos ou reservas da LQC incompletos. Confira o estudo antes de calcular a margem.' };
  const resultado = dados.resultado;
  const bdi = dados.composicao?.bdi;
  if (!numero(resultado?.custo) || !numero(resultado?.custosExternos) || resultado.custosExternos > resultado.custo ||
      !['impostos', 'factoring', 'administracao', 'seguro', 'risco', 'comissoes'].every((campo) => numero(bdi?.[campo]))) return pendente;
  if ((op.itens || []).some((item) => item.faturamentoDireto)) {
    return { ...pendente, motivo: 'Concilie o faturamento direto com a LQC para calcular a margem do contrato base.' };
  }
  const receitasBase = (op.receitas || []).filter((r) => !r.aditivoId);
  if (op.valorTotalContrato != null && ((op.aditivos || []).length || (op.receitas || []).some((r) => r.aditivoId))) {
    return { ...pendente, motivo: 'Separe o valor do contrato base e dos aditivos para comparar com os custos da LQC.' };
  }
  if (!receitasBase.length || receitasBase.some((r) => !numero(r.valor))) return pendente;
  if (op.valorTotalContrato != null && !numero(op.valorTotalContrato)) return pendente;
  const receita = dinheiro(op.valorTotalContrato ?? receitasBase.reduce((s, r) => s + r.valor, 0));
  if (receita <= 0) return { ...pendente, motivo: 'Informe o valor do contrato base para calcular a margem.' };
  const custo = dinheiro(resultado.custo);
  const compras = dinheiro(resultado.custosExternos);
  const impostos = dinheiro(receita * bdi.impostos / 100);
  const financeiro = dinheiro(receita * bdi.factoring / 100);
  const outrasReservas = dinheiro(custo * (bdi.administracao + bdi.seguro + bdi.risco) / 100 + receita * bdi.comissoes / 100);
  const margem = dinheiro(receita - custo - impostos - financeiro - outrasReservas);
  return { valido: true, codigo: dados.codigo, receita, custo, compras, internos: dinheiro(custo - compras), impostos, financeiro, outrasReservas, margem, margemPct: margem / receita * 100 };
}
