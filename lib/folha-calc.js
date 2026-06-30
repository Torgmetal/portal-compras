// Cálculo determinístico da folha — fonte única usada pela tela e pelo export.
// Só os campos que NÃO dependem de tabela de imposto anual: Base INSS, FGTS,
// INSS Patronal, Base IRRF, Excedente INSS. INSS/IRRF/Líquido são digitados.

const TETO_INSS = 8475.55; // teto 2026
const ALIQ_FGTS = 0.08;
const ALIQ_INSS_PATRONAL = 0.20;

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * Calcula os derivados de um item de folha.
 * @param {object} it { tipoContrato, salarioBase, horasExtras, adicionais, inss }
 * @returns {{ baseInss, excedenteInss, inssPatronal, fgts, baseIrrf, totalProventos }}
 */
export function calcDerivados(it) {
  const salario = n(it.salarioBase);
  const he = n(it.horasExtras);
  const adic = n(it.adicionais);
  const inss = n(it.inss);

  // PJ: sem encargos trabalhistas — só proventos.
  if (it.tipoContrato === "PJ") {
    const totalProventos = salario + he + adic;
    return { baseInss: 0, excedenteInss: 0, inssPatronal: 0, fgts: 0, baseIrrf: 0, totalProventos };
  }

  const baseInss = salario + he + adic;
  return {
    baseInss,
    excedenteInss: Math.max(0, baseInss - TETO_INSS),
    inssPatronal: salario * ALIQ_INSS_PATRONAL,
    fgts: baseInss * ALIQ_FGTS,
    baseIrrf: Math.max(0, baseInss - inss),
    totalProventos: baseInss,
  };
}

/** Item + derivados num objeto só (pra UI/export). */
export function comDerivados(it) {
  return { ...it, ...calcDerivados(it) };
}

const CAMPOS_SOMA = ["salarioBase", "horasExtras", "adicionais", "descontos", "inss", "irrf", "liquido", "vr", "ifood", "kr", "rescisao", "baseInss", "inssPatronal", "fgts"];

function zerado() {
  return Object.fromEntries(CAMPOS_SOMA.map((c) => [c, 0]));
}
function acumular(acc, it) {
  const d = calcDerivados(it);
  for (const c of CAMPOS_SOMA) acc[c] += n(it[c] ?? d[c]);
  acc.qtd = (acc.qtd || 0) + 1;
  return acc;
}

/**
 * Totais gerais + resumo agrupado por empresa → centro de custo → tipoContrato.
 * Mantém salário e horas extras separados (o financeiro lança separado no Omie).
 */
export function resumo(itens) {
  const total = zerado();
  const grupos = new Map(); // chave "empresa||cc||tipo"
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
