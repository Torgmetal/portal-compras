// A previsão é um compromisso registrado: abrir a tela não muda sua data.
// O instante salvo usa o calendário de São Paulo, independente do fuso da Vercel.
export function previsaoDaSequencia(tarefa, agora = new Date()) {
  const vazia = { previsaoFim: null, atrasoPrevisto: 0, estimativaVelha: false };
  if (tarefa.diasParaConcluir == null || !tarefa.estimativaEm || tarefa.percentualRealizado >= 100) return vazia;
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(tarefa.estimativaEm));
  const campo = tipo => partes.find(p => p.type === tipo).value;
  const previsao = new Date(`${campo('year')}-${campo('month')}-${campo('day')}T12:00:00Z`);
  let faltam = tarefa.diasParaConcluir;
  while (faltam > 0) {
    previsao.setUTCDate(previsao.getUTCDate() + 1);
    if (![0, 6].includes(previsao.getUTCDay())) faltam--;
  }
  const prazo = tarefa.dataFimPrevista ? new Date(`${new Date(tarefa.dataFimPrevista).toISOString().slice(0, 10)}T12:00:00Z`) : null;
  return {
    previsaoFim: previsao.toISOString(),
    atrasoPrevisto: prazo ? Math.max(0, Math.round((previsao - prazo) / 86400000)) : 0,
    estimativaVelha: (agora - new Date(tarefa.estimativaEm)) / 86400000 > 7,
  };
}
