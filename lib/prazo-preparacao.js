
import { POOLS, poolDaPeca } from "./lote-do-dia";

// ─── QUANTO TEMPO A PREPARAÇÃO LEVA PARA FECHAR ESTA LISTA ────────────────────
// Vitor (26/08/2026): "de acordo com o total da lista ou a seleção das peças vc já nos informa
// quanto tempo de acordo com a nossa meta e sua avaliação de peças extra leves, leve, média,
// pesada e extra pesada para podermos definir o tempo que será necessário para o setor finalizar".
//
// ⚠⚠ PESO SOZINHO MENTE, E ESSE É O PONTO DA CLASSE. Duas listas de 12 t não levam o mesmo tempo:
// 12 t de extra leve são ~4.000 peças e 12 t de extra pesado são ~60. A máquina corta UMA PEÇA POR
// VEZ — quem manda no dia é o maior dos dois tetos, o de peso e o de peças. Medido na OP-067: 28
// dias pelo peso e 82 pelas peças. Quem olhasse só o peso prometeria um mês e entregaria três.
//
// ⚠ AS FAIXAS SÃO AS DA LQC (lib/lqc.js CLASSES), em kg/m. Não são "parecidas": são as mesmas, para
// o Planejamento e o Comercial falarem da mesma peça com a mesma palavra. Mudou lá, muda aqui.
export const CLASSES_PECA = [
  { key: "EXTRA_LEVE",   nome: "Extra leve",   faixa: "até 10 kg/m",  ate: 10 },
  { key: "LEVE",         nome: "Leve",         faixa: "10 a 25 kg/m", ate: 25 },
  { key: "MEDIO",        nome: "Médio",        faixa: "25 a 60 kg/m", ate: 60 },
  { key: "PESADO",       nome: "Pesado",       faixa: "60 a 120 kg/m", ate: 120 },
  { key: "EXTRA_PESADO", nome: "Extra pesado", faixa: "acima de 120 kg/m", ate: Infinity },
];

// kg por metro da peça — peso de UMA peça dividido pelo comprimento dela.
// ⚠ o peso da linha da LPC é o do LOTE (qte × unitário); dividir o total pelo comprimento daria
// a classe de um feixe, não da peça, e jogaria tudo para extra pesado.
export function kgPorMetro(p) {
  const q = Math.max(1, Number(p?.qte) || 1);
  const un = Number(p?.pesoUnitKg) || (Number(p?.pesoTotalKg) || 0) / q;
  const m = (Number(p?.comprimentoMm) || 0) / 1000;
  return m > 0 && un > 0 ? un / m : 0;
}

export function classeDaPeca(p) {
  const kgm = kgPorMetro(p);
  if (!kgm) return null; // sem comprimento não dá para classificar — e inventar seria pior
  return CLASSES_PECA.find((c) => kgm < c.ate) || CLASSES_PECA[CLASSES_PECA.length - 1];
}

// A meta do dia dividida entre os dois lasers, na proporção do que cada um faz.
// ⚠ MESMA REPARTIÇÃO DE `montarLoteDoDia`: se a previsão usasse outra, o lote do dia e o prazo
// diriam coisas diferentes sobre o mesmo dia de trabalho.
export function capacidadeDoDia(metaKg = 12000, pools = POOLS) {
  const medido = Object.values(pools).reduce((s, c) => s + c.kgDia, 0) || 1;
  const fator = metaKg / medido;
  return Object.fromEntries(Object.entries(pools).map(([k, c]) => [k, {
    label: c.label, kg: c.kgDia * fator, un: Math.max(1, Math.round(c.pecasDia * fator)),
  }]));
}

/**
 * @param {Array} pecas linhas da LPC ({ qte, pesoUnitKg, pesoTotalKg, comprimentoMm, perfil })
 * @returns dias + o porquê: teto que travou, quebra por laser e por classe
 */
export function estimarPrazo(pecas, { metaKg = 12000, pools = POOLS } = {}) {
  const cap = capacidadeDoDia(metaKg, pools);
  const porPool = {}, porClasse = {};
  let kg = 0, un = 0;

  for (const p of pecas || []) {
    const q = Math.max(1, Number(p.qte) || 1);
    const w = Number(p.pesoTotalKg) || 0;
    kg += w; un += q;

    const pool = p.pool || poolDaPeca(p.perfil);
    const gp = (porPool[pool] ||= { pool, label: cap[pool]?.label || pool, kg: 0, un: 0 });
    gp.kg += w; gp.un += q;

    const c = classeDaPeca(p);
    const ck = c?.key || "SEM_CLASSE";
    const gc = (porClasse[ck] ||= { key: ck, nome: c?.nome || "Sem comprimento", faixa: c?.faixa || "", linhas: 0, un: 0, kg: 0 });
    gc.linhas++; gc.un += q; gc.kg += w;
  }

  // ⚠ OS LASERS RODAM EM PARALELO: o prazo é o do laser mais carregado, não a soma dos dois.
  // Somar diria que a casa para de cortar perfil enquanto corta chapa.
  const pools_ = Object.values(porPool).map((g) => {
    const c = cap[g.pool] || { kg: metaKg, un: 1 };
    const diasKg = c.kg > 0 ? g.kg / c.kg : 0;
    const diasUn = c.un > 0 ? g.un / c.un : 0;
    return { ...g, diasKg, diasUn, dias: Math.max(diasKg, diasUn), limite: diasUn > diasKg ? "pecas" : "peso" };
  }).sort((a, b) => b.dias - a.dias);

  const dias = pools_.length ? pools_[0].dias : 0;
  return {
    kg, un, metaKg,
    dias, diasCheios: Math.max(dias > 0 ? 1 : 0, Math.ceil(dias - 1e-9)),
    limite: pools_[0]?.limite || null,
    porPool: pools_,
    porClasse: CLASSES_PECA.map((c) => porClasse[c.key]).filter(Boolean)
      .concat(porClasse.SEM_CLASSE ? [porClasse.SEM_CLASSE] : []),
  };
}

// dias ÚTEIS a partir de uma data (a fábrica não corta no fim de semana)
export function somarDiasUteis(inicio, n) {
  const d = new Date(inicio); d.setUTCHours(12, 0, 0, 0);
  let faltam = Math.max(0, Math.ceil(n));
  while (faltam > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow >= 1 && dow <= 5) faltam--;
  }
  return d;
}

// próximo dia útil (hoje, se hoje for útil) — usado quando o marco já passou
export function proximoDiaUtil(base = new Date()) {
  const d = new Date(base); d.setUTCHours(12, 0, 0, 0);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}
