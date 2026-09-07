// Quantidades são conciliadas dentro de uma remessa; uma marca nunca identifica outra OP.
export const DESTINOS_TERCEIRO = ['MONTAGEM','SOLDA','ACABAMENTO','JATO','PINTURA','EXPEDICAO'];
export const marcaTerceiro = v => String(v || '').trim().toUpperCase();
export const opTerceiro = v => String(v || '').trim().toUpperCase().replace(/^OP[\s-]*/, '').replace(/^0+(?=\d)/, '');
export function saldosTerceiro(rom) {
  const retornos = Array.isArray(rom.retornos) ? rom.retornos : [];
  return (Array.isArray(rom.itens) ? rom.itens : []).map(it => {
    const recebido = retornos.flatMap(r => r.itens || []).filter(r => marcaTerceiro(r.marca) === marcaTerceiro(it.marca));
    const semQuantidade = recebido.some(r => r.qte == null);
    const voltou = recebido.reduce((a, r) => a + (Number(r.qte) || 0), 0);
    const enviada = it.qte == null ? null : Number(it.qte);
    return {...it, enviada, voltou, saldo: enviada == null || semQuantidade ? null : Math.max(0, enviada - voltou),
      pesoUn: Number(it.pesoUn) || (enviada > 0 ? Number(it.pesoTotal || 0) / enviada : 0)};
  });
}
export function validarRetorno(rom, itens) {
  if (rom.status === 'CANCELADO') throw new Error('Não é possível receber uma remessa cancelada.');
  const saldos = saldosTerceiro(rom), vistos = new Set(), totais = new Map();
  if (!itens?.length) throw new Error('Informe ao menos uma marca recebida.');
  return itens.map(it => {
    const key = marcaTerceiro(it.marca), s = saldos.find(x => marcaTerceiro(x.marca) === key);
    if (!s) throw new Error(`Marca ${key} não pertence a esta remessa.`);
    if (s.saldo == null) throw new Error(`Confira as quantidades históricas da marca ${key} antes de receber.`);
    if (!Number.isInteger(it.qte) || it.qte <= 0 || it.qte > s.saldo) throw new Error(`Quantidade de ${key} deve estar entre 1 e ${s.saldo}.`);
    const destino = it.destino || s.destino;
    if (!DESTINOS_TERCEIRO.includes(destino)) throw new Error(`Informe o setor de retorno da marca ${key}.`);
    const alocacao = key + '|' + destino;
    if (vistos.has(alocacao)) throw new Error(`Marca ${key} repetida no setor ${destino}.`);
    vistos.add(alocacao);
    const total = (totais.get(key) || 0) + it.qte;
    if (total > s.saldo) throw new Error(`A soma dos setores da marca ${key} excede o saldo de ${s.saldo} peças.`);
    totais.set(key, total);
    return {marca:s.marca,qte:it.qte,pesoTotal:Math.round(s.pesoUn*it.qte*1000)/1000,destino};
  });
}
export function statusRetorno(rom) {
  const saldos = saldosTerceiro(rom);
  if (rom.status === 'CANCELADO') return 'CANCELADO';
  if (saldos.length && saldos.every(s => s.saldo === 0)) return 'RETORNADO';
  return (rom.retornos || []).length ? 'PARCIAL' : 'ENVIADO';
}
export function conferirImportacao(linhas, rom) {
  const saldos = saldosTerceiro(rom), vistos = new Set();
  return linhas.map(l => {
    const marca = marcaTerceiro(l.marca), qte = Number(l.qte), key = opTerceiro(l.op)+'|'+marca;
    const s = saldos.find(i => marcaTerceiro(i.marca) === marca);
    let erro = '';
    if (!l.op || opTerceiro(l.op) !== opTerceiro(rom.opRefNumero)) erro='OP ausente ou diferente da remessa selecionada';
    else if (!s) erro='Marca não encontrada nesta remessa';
    else if (vistos.has(key)) erro='Marca repetida no documento; confira as linhas';
    else if (s.saldo == null) erro='Saldo histórico sem quantidade';
    else if (!Number.isInteger(qte) || qte <= 0 || qte > s.saldo) erro='Quantidade inválida ou acima do saldo';
    vistos.add(key);
    return {op:l.op,marca,qte,erro,saldo:s?.saldo ?? null,destino:s?.destino || ''};
  });
}

export function retornoEmAtraso(rom, hoje) {
  return statusRetorno(rom) !== 'CANCELADO' && statusRetorno(rom) !== 'RETORNADO'
    && Boolean(rom.dataPrevRetorno) && String(rom.dataPrevRetorno).slice(0, 10) < hoje;
}
