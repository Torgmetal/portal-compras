// Cálculo de férias — período aquisitivo/vencimento e valor estimado.
// "Noção" pro RH: aproximado (não considera afastamentos que suspendem o período,
// nem médias variáveis). Fonte única usada pela API e pela tela.

const DIA = 86400000;

/** Soma meses a uma data (date-only, UTC — não desloca fuso). */
function addMeses(data, n) {
  const d = new Date(data);
  const base = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  base.setUTCMonth(base.getUTCMonth() + n);
  return base;
}
function hojeUTC() {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

/**
 * Período aquisitivo atual + vencimento (limite do período concessivo).
 * @param {Date|string} dataAdmissao
 * @param {number} feriasConcluidas nº de períodos de férias já gozados
 */
export function periodoAtual(dataAdmissao, feriasConcluidas = 0) {
  if (!dataAdmissao) return null;
  const aquisInicio = addMeses(dataAdmissao, feriasConcluidas * 12);
  const aquisFim = addMeses(aquisInicio, 12);          // fim do aquisitivo (direito completo)
  const vencimento = addMeses(aquisFim, 12);           // limite pra gozar (fim do concessivo)
  const hoje = hojeUTC();
  const diasParaVencer = Math.round((vencimento - hoje) / DIA);

  let situacao, alerta;
  if (hoje < aquisFim) { situacao = "EM_AQUISICAO"; alerta = "ok"; }
  else if (hoje > vencimento) { situacao = "VENCIDA"; alerta = "vermelho"; }
  else { situacao = "A_GOZAR"; alerta = diasParaVencer <= 90 ? "ambar" : "ok"; }

  return {
    aquisInicio: aquisInicio.toISOString().slice(0, 10),
    aquisFim: aquisFim.toISOString().slice(0, 10),
    vencimento: vencimento.toISOString().slice(0, 10),
    diasParaVencer,
    situacao,
    alerta,
  };
}

/**
 * Valor estimado das férias: férias + abono (dias vendidos) + 1/3 constitucional.
 * @returns {{ ferias, abono, terco, total }}
 */
export function valorFerias(salario, diasGozo = 30, diasVendidos = 0, descontos = 0) {
  const base = (Number(salario) || 0) / 30;
  const ferias = base * (Number(diasGozo) || 0);
  const abono = base * (Number(diasVendidos) || 0);
  const terco = (ferias + abono) / 3;
  const bruto = ferias + abono + terco;
  const desc = Number(descontos) || 0;
  const r2 = (v) => Math.round(v * 100) / 100;
  return {
    ferias: r2(ferias),
    abono: r2(abono),
    terco: r2(terco),
    bruto: r2(bruto),
    descontos: r2(desc),
    total: r2(bruto - desc), // valor líquido
  };
}

/** Data fim do gozo a partir do início + dias (inclusive). */
export function fimGozo(dataInicio, diasGozo) {
  if (!dataInicio || !diasGozo) return null;
  const d = new Date(dataInicio);
  const base = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  base.setUTCDate(base.getUTCDate() + (Number(diasGozo) - 1));
  return base.toISOString().slice(0, 10);
}
