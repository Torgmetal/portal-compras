// Cálculo do custo/preço-hora por setor a partir da ConfigCustoHora salva.
// Espelha a lógica da tela (app/comercial/orcamentos/custo-hora/CustoHoraClient):
//   overhead a ratear = folha dos setores que NÃO faturam (ADM) + outrosCustos
//   (custos operacionais não-folha), rateado nos que faturam por MOD/headcount/
//   horas. Usado pra puxar o "valor/hora" nas propostas de serviço.
const num = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
const canon = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// ⚠⚠ ABSENTEÍSMO ACIMA DISSO É ERRO DE DIGITAÇÃO, NÃO INFORMAÇÃO.
// O `ocupacaoPct` da ConfigCustoHora é o campo "Absenteísmo (%)" da tela e entra como
// (1 − absenteísmo). Em 24/08/2026 o banco tinha 80: cada pessoa faltando 4 dias em 5, jornada de
// 38,5 h/mês, custo-hora 4,6× alto — SOLDAGEM a R$ 889/h em vez de R$ 193/h. Veio do fallback
// `num(ocupacao) || 80` do formulário, corrigido junto com isto.
//
// ⚠ o preço-hora alimenta proposta de serviço. Preço 4,6× alto não perde a obra por pouco: some do
// páreo sem ninguém entender por quê. Por isso `precoHoraDoServico` devolve null com a configuração
// nesse estado, em vez de devolver um número — vazio o orçamentista percebe, errado não.
export const ABSENTEISMO_MAX = 40;

export function configCustoHoraCoerente(config) {
  return num(config?.ocupacaoPct) <= ABSENTEISMO_MAX;
}

export function calcularCustoHora(config) {
  const c = config || {};
  const f = num(c.fatorEncargos) || 1.8;
  const criterio = c.criterioRateio || "MOD";
  const margem = num(c.margemPct);
  const imp = Math.min(89, num(c.impostosVendaPct)) / 100;
  const horasPorPessoa = (num(c.horasDia) || 8.75) * (num(c.diasUteis) || 22) * (1 - num(c.ocupacaoPct) / 100);
  const setores = Array.isArray(c.setores) ? c.setores : [];
  const outros = Array.isArray(c.outrosCustos) ? c.outrosCustos : [];

  const fatura = (s) => s.faturaHora !== false;
  const horasMes = (s) => (num(s.horasMes) > 0 ? num(s.horasMes) : num(s.headcount) * horasPorPessoa);
  const mod = (s) => (num(s.mod) > 0 ? num(s.mod) : num(s.salarios) * f);

  const overheadFolha = setores.reduce((a, s) => a + (fatura(s) ? 0 : mod(s) + num(s.cifDireto)), 0);
  const outrosTotal = outros.reduce((a, x) => a + num(x.valor), 0);
  const overheadTotal = overheadFolha + outrosTotal;

  const modBill = setores.reduce((a, s) => a + (fatura(s) ? mod(s) : 0), 0);
  const hcBill = setores.reduce((a, s) => a + (fatura(s) ? num(s.headcount) : 0), 0);
  const horasBill = setores.reduce((a, s) => a + (fatura(s) ? horasMes(s) : 0), 0);
  const peso = (s) => {
    if (!fatura(s)) return 0;
    if (criterio === "HEADCOUNT") return hcBill ? num(s.headcount) / hcBill : 0;
    if (criterio === "HORAS") return horasBill ? horasMes(s) / horasBill : 0;
    return modBill ? mod(s) / modBill : 0;
  };

  return setores.map((s) => {
    const oh = fatura(s) ? overheadTotal * peso(s) : 0;
    const custoMes = mod(s) + num(s.cifDireto) + oh;
    const h = horasMes(s);
    const custoHora = fatura(s) && h > 0 ? custoMes / h : 0;
    const precoHora = fatura(s) ? (custoHora * (1 + margem / 100)) / (1 - imp) : 0;
    return { nome: s.nome || "", empresa: s.empresa || "", faturaHora: fatura(s), custoHora, precoHora };
  });
}

// Palavras-chave que ligam cada serviço da proposta ao setor do custo-hora.
const SERVICO_SETOR = {
  CORTE_FURACAO: ["prepar", "corte", "furac"],
  JATEAMENTO: ["jato", "jate"],
  PINTURA: ["pintura", "pint"],
  SOLDA: ["solda"],
};

// Devolve o setor (com preço-hora) que corresponde a um serviço, ou null.
export function precoHoraDoServico(config, servico) {
  if (!configCustoHoraCoerente(config)) return null;
  const precos = calcularCustoHora(config).filter((p) => p.faturaHora && p.precoHora > 0);
  const chaves = SERVICO_SETOR[servico] || [];
  return precos.find((p) => chaves.some((k) => canon(p.nome).includes(k))) || null;
}
