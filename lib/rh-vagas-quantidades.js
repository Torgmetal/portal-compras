export function resumoVaga(vaga) {
  const total = Number(vaga.quantidade) || 0;
  // Compatibilidade com registros anteriores à implantação da baixa parcial.
  const preenchidas = vaga.status === 'PREENCHIDA' ? total : (vaga.quantidadePreenchida ?? 0);
  const restantes = Math.max(0, total - preenchidas);
  return {total, preenchidas, restantes, abertas: ['PREENCHIDA','CANCELADA'].includes(vaga.status) ? 0 : restantes};
}

function recusar(mensagem, status = 400) {
  const erro = new Error(mensagem); erro.status = status; throw erro;
}

export function aplicarQuantidadesVaga(vaga, patch, agora = new Date()) {
  const {quantidadeContratada, versaoEsperada, ...data} = patch;
  const atual = resumoVaga(vaga);
  const total = data.quantidade ?? atual.total;
  let preenchidas = atual.preenchidas;
  if (total < preenchidas) recusar(`O total não pode ser menor que as ${preenchidas} contratações já registradas.`);
  if (quantidadeContratada !== undefined) {
    if (!Number.isInteger(quantidadeContratada) || quantidadeContratada < 1) recusar('Informe uma quantidade inteira maior que zero.');
    if (!versaoEsperada || versaoEsperada !== new Date(vaga.updatedAt).toISOString()) recusar('Esta vaga foi atualizada. Recarregue a lista antes de registrar a contratação.', 409);
    if (!['APROVADA','EM_RECRUTAMENTO'].includes(vaga.status)) recusar('A vaga precisa estar aprovada ou em recrutamento.');
    if (Object.keys(data).some(k => k !== 'funcionarioContratadoNome')) recusar('Registre a contratação separadamente da edição da vaga.');
    if (quantidadeContratada > atual.restantes) recusar(`A quantidade supera o saldo de ${atual.restantes} vaga(s).`);
    preenchidas += quantidadeContratada;
    if (data.funcionarioContratadoNome?.trim()) {
      data.funcionarioContratadoNome = [vaga.funcionarioContratadoNome, data.funcionarioContratadoNome.trim()].filter(Boolean).join('\n');
    } else delete data.funcionarioContratadoNome;
    data.status = preenchidas === total ? 'PREENCHIDA' : 'EM_RECRUTAMENTO';
  } else if (data.status === 'PREENCHIDA') {
    // Clientes antigos ainda enviam o encerramento de todas as posições.
    preenchidas = total;
  }
  let status = data.status || vaga.status;
  if (status !== 'CANCELADA') {
    if (preenchidas === total) status = 'PREENCHIDA';
    else if (status === 'PREENCHIDA') status = 'EM_RECRUTAMENTO';
  }
  data.quantidadePreenchida = preenchidas;
  data.status = status;
  data.dataFechamento = status === 'PREENCHIDA'
    ? (vaga.status === 'PREENCHIDA' ? data.dataFechamento || vaga.dataFechamento || agora : data.dataFechamento || agora)
    : status === 'CANCELADA' ? data.dataFechamento || vaga.dataFechamento || agora : null;
  return data;
}
