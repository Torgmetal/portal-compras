const moeda = (valor) => valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function MargemOrcadaLqc({ dados }) {
  if (!dados) return null;
  return <div className="p-5 bg-blue-50/30 border-t border-gray-100">
    <h3 className="text-sm font-semibold text-torg-dark">Margem orçada da LQC · contrato base</h3>
    {!dados.valido ? <p className="text-sm text-amber-800 mt-2">{dados.motivo}</p> : <>
      <dl className="grid grid-cols-1 gap-y-2 mt-3 text-sm">
        {[
          ['Contrato base atual', dados.receita], ['Compras e serviços externos', dados.compras],
          ['Fabricação, pintura e demais custos internos', dados.internos], ['Reserva para impostos', dados.impostos],
          ['Reserva financeira', dados.financeiro], ...(dados.outrasReservas ? [['Demais reservas do BDI', dados.outrasReservas]] : []),
        ].map(([rotulo, valor]) => <div key={rotulo} className="flex justify-between gap-3"><dt className="text-torg-gray">{rotulo}</dt><dd className="font-semibold text-torg-dark whitespace-nowrap">{moeda(valor)}</dd></div>)}
      </dl>
      <div className="flex flex-wrap justify-between gap-2 border-t border-gray-200 pt-3 mt-3">
        <span className="font-semibold text-torg-dark">Resultado orçado</span>
        <strong className={dados.margem < 0 ? 'text-red-700' : 'text-torg-blue'}>{moeda(dados.margem)} · {dados.margemPct.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</strong>
      </div>
    </>}
    <p className="text-xs text-torg-gray mt-3">Base: {dados.codigo || 'LQC vinculada'}. Custos e reservas do estudo, sem aditivos. A apuração fiscal e os custos realizados devem ser conferidos separadamente; esta é uma estimativa do orçamento.</p>
  </div>;
}
