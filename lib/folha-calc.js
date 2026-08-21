// Cálculo determinístico da folha — fonte única usada pela tela e pelo export.
// O RH digita HORAS (extras por %, faltas, atrasos, vindas do Ponto) + os valores em
// R$ (adicionais, descontos, INSS, IRRF). O portal calcula o VALOR das horas (valor-hora
// × adicional da %), os descontos de falta/atraso e o SALÁRIO FINAL. Base INSS/FGTS/
// Patronal/Base IRRF derivam daqui. INSS e IRRF em si continuam digitados (tabela anual).

const TETO_INSS = 8475.55; // teto 2026
const ALIQ_FGTS = 0.08;
const ALIQ_INSS_PATRONAL = 0.20;
const DIVISOR_PADRAO = 220; // horas/mês p/ valor-hora (44h/semana)

// Adicional por faixa de hora extra: valor = horas × valor-hora × (1 + %/100).
const MULT_HE = { 50: 1.5, 60: 1.6, 80: 1.8, 100: 2.0, 150: 2.5 };
const PCT_AD_NOTURNO = 0.20; // adicional noturno legal (CLT urbano): 20% sobre a hora normal

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
// VMI é Simples Nacional — INSS patronal embutido no DAS, não se calcula os 20% à parte.
const semInssPatronal = (empresa) => /vmi/i.test(String(empresa || ""));

/**
 * Calcula os derivados de um item de folha (valores em R$ e o salário final).
 * @returns {{ valorHora, heValorHoras, heValorTotal, faltasValor, atrasosValor,
 *             baseInss, excedenteInss, inssPatronal, fgts, baseIrrf, totalProventos, salarioFinal }}
 */
export function calcDerivados(it) {
  const salario = n(it.salarioBase);
  const divisor = n(it.divisorHoras) > 0 ? n(it.divisorHoras) : DIVISOR_PADRAO;
  const valorHora = divisor > 0 ? salario / divisor : 0;

  // Horas extras por % → R$ (novo). Soma o legado horasExtras (R$) p/ competências antigas.
  const heValorHoras =
    n(it.heHoras50) * valorHora * MULT_HE[50] +
    n(it.heHoras60) * valorHora * MULT_HE[60] +
    n(it.heHoras80) * valorHora * MULT_HE[80] +
    n(it.heHoras100) * valorHora * MULT_HE[100] +
    n(it.heHoras150) * valorHora * MULT_HE[150];
  const heValorTotal = heValorHoras + n(it.horasExtras);

  // Adicional noturno: só o adicional (20%) sobre a hora, não a hora cheia (essa já está no salário).
  const adNoturnoValor = n(it.adNoturnoHoras) * valorHora * PCT_AD_NOTURNO;

  // Faltas e atrasos (em horas) viram DESCONTO pelo valor-hora simples.
  const faltasValor = n(it.faltasHoras) * valorHora;
  const atrasosValor = n(it.atrasosHoras) * valorHora;

  const adic = n(it.adicionais);
  const descontos = n(it.descontos);
  const inss = n(it.inss);
  const irrf = n(it.irrf);

  // PJ: sem encargos trabalhistas — só proventos e descontos informados.
  if (it.tipoContrato === "PJ") {
    const totalProventos = salario + heValorTotal + adNoturnoValor + adic;
    const salarioFinal = totalProventos - faltasValor - atrasosValor - descontos;
    return { valorHora, heValorHoras, heValorTotal, adNoturnoValor, faltasValor, atrasosValor,
      baseInss: 0, excedenteInss: 0, inssPatronal: 0, fgts: 0, baseIrrf: 0, totalProventos, salarioFinal };
  }

  const baseInss = salario + heValorTotal + adNoturnoValor + adic;
  const salarioFinal = baseInss - faltasValor - atrasosValor - descontos - inss - irrf;
  return {
    valorHora, heValorHoras, heValorTotal, adNoturnoValor, faltasValor, atrasosValor,
    baseInss,
    excedenteInss: Math.max(0, baseInss - TETO_INSS),
    inssPatronal: semInssPatronal(it.empresa) ? 0 : salario * ALIQ_INSS_PATRONAL,
    fgts: baseInss * ALIQ_FGTS,
    baseIrrf: Math.max(0, baseInss - inss),
    totalProventos: baseInss,
    salarioFinal,
  };
}

/** Item + derivados num objeto só (pra UI/export). */
export function comDerivados(it) {
  return { ...it, ...calcDerivados(it) };
}

const CAMPOS_SOMA = ["salarioBase", "heValorTotal", "adNoturnoValor", "faltasValor", "atrasosValor", "adicionais", "descontos", "inss", "irrf", "salarioFinal", "vr", "ifood", "kr", "rescisao", "baseInss", "inssPatronal", "fgts"];

function zerado() {
  return Object.fromEntries(CAMPOS_SOMA.map((c) => [c, 0]));
}
function acumular(acc, it) {
  const d = calcDerivados(it);
  const full = { ...it, ...d };
  for (const c of CAMPOS_SOMA) acc[c] += n(full[c]);
  acc.qtd = (acc.qtd || 0) + 1;
  return acc;
}

/** Totais gerais + resumo agrupado por empresa → centro de custo → tipoContrato. */
export function resumo(itens) {
  const total = zerado();
  const grupos = new Map();
  for (const it of itens) {
    acumular(total, it);
    const empresa = it.empresa || "—";
    const cc = it.centroCusto || "—";
    const tipo = it.tipoContrato || "CLT";
    const chave = `${empresa}||${cc}||${tipo}`;
    if (!grupos.has(chave)) grupos.set(chave, { empresa, centroCusto: cc, tipoContrato: tipo, ...zerado(), qtd: 0 });
    acumular(grupos.get(chave), it);
  }
  const linhas = [...grupos.values()].sort((a, b) =>
    a.empresa.localeCompare(b.empresa, "pt-BR") || a.centroCusto.localeCompare(b.centroCusto, "pt-BR") || a.tipoContrato.localeCompare(b.tipoContrato));
  return { total, grupos: linhas };
}
