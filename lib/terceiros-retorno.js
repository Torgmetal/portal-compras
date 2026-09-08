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

/* ─── O QUE ESTÁ FORA DA FÁBRICA ───────────────────────────────────────────────────────────────
   ⚠⚠ Vitor (08/09/2026): "da OP-97 mandamos os guarda-corpos para terceiros, nesse caso as marcas
   que estão nos romaneios de terceiros não devem aparecer na programação de nenhum setor".

   A regra já existia, mas dependia de alguém marcar a PEÇA (`PecaConjunto.terceirizado`) além de
   emitir o romaneio — duas portas para o mesmo fato. Medido no dia: das quatro remessas, a RT-03
   (74 marcas na galvanização, OP-097) tinha ZERO peças marcadas, e 48 delas continuavam com dia
   programado em montagem, solda e acabamento. A RT-04 (os 65 guarda-corpos da RV) estava marcada
   e já não aparecia. Ou seja: o que poluía o quadro não era o guarda-corpo, era a galvanização —
   porque só ela passou pela porta que ninguém lembrou de abrir.

   Daqui em diante a REMESSA é a autoridade: existe romaneio vivo com saldo lá fora, a marca sai da
   programação. Marcar a peça continua valendo (é ela que manda no setor de retorno), mas esquecer
   de marcar não devolve mais a peça para uma bancada onde ela não está.

   ⚠ A CHAVE LEVA A OP. Marca não é única entre obras [[torg_marca_nao_unica]] — só "T97B2" tiraria
   uma peça homônima de outra OP do quadro.

   ⚠ SALDO DESCONHECIDO CONTA COMO FORA. `saldosTerceiro` devolve `null` quando a remessa histórica
   não tem quantidade; programar o que não se prova que voltou é pior do que esperar o retorno. */
export function chavesNoTerceiro(romaneios) {
  const fora = new Set();
  for (const r of romaneios || []) {
    if (!r || r.status === 'CANCELADO') continue;
    const op = opTerceiro(r.opRefNumero);
    if (!op) continue;
    for (const s of saldosTerceiro(r)) {
      if (s.saldo === 0) continue; // voltou inteira: é fila nossa de novo
      fora.add(op + '|' + marcaTerceiro(s.marca));
    }
  }
  return fora;
}

/** `fora` é o Set de chavesNoTerceiro. Normaliza dos dois lados — o portal escreve "097" e a
 *  remessa às vezes guarda "97" ou "OP-97". */
export const noTerceiro = (fora, opNumero, marca) =>
  !!fora?.size && fora.has(opTerceiro(opNumero) + '|' + marcaTerceiro(marca));

export function retornoEmAtraso(rom, hoje) {
  return statusRetorno(rom) !== 'CANCELADO' && statusRetorno(rom) !== 'RETORNADO'
    && Boolean(rom.dataPrevRetorno) && String(rom.dataPrevRetorno).slice(0, 10) < hoje;
}
