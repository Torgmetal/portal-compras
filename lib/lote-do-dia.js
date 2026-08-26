// O LOTE DO DIA — atravessa TODAS as obras e fecha conjunto.
//
// Vitor (25/08/2026): "vamos fazer a lógica novamente para não ficar nada aberto, precisamos do
// ritmo acelerado, não podemos deixar de produzir menos que 260 ton... você precisa selecionar
// todos os projetos possíveis para garantirmos o volume diário".
//
// ⚠⚠ DUAS REGRAS MUDAM TUDO EM RELAÇÃO À VERSÃO ANTERIOR:
//
//   1. NÃO É POR OBRA. Uma obra sozinha não fecha o dia — medido na OP-067: com meta de 12 t ela
//      enche os dois pools em 5.310 kg porque as peças dela pesam 5 kg em média. O dia se monta
//      misturando obras, pegando peça pesada de uma e leve de outra até os dois pools fecharem.
//
//   2. CONJUNTO É ATÔMICO — "para não ficar nada aberto". Cortar 90% dos croquis de um conjunto
//      entrega ZERO: a montagem não começa. Ou o conjunto inteiro entra no lote, ou fica para o
//      próximo. É isto que separa um lote que vira estrutura de um lote que vira pilha.
//
// ⚠ SEM `server-only`: a tela recalcula a cada ajuste de meta ou filtro.

// ⚠⚠ A CAPACIDADE NÃO É A MEDIANA — A MEDIANA É A DEMANDA. Medido no Syneco (dia útil,
// 01/06→24/08/2026, 57 e 60 dias):
//
//   perfis   mediana 118 peças / 3.515 kg   p90 452 / 6.110   MÁXIMO 1.264 / 14.848
//   chapas   mediana 375 peças / 1.719 kg   p90 1.135 / 3.109 MÁXIMO 3.629 / 5.113
//
// O melhor dia do pool de perfis foi 10,7× a mediana. Usar a mediana como teto fazia a simulação
// parar em 2.646 kg/dia e concluir que a fábrica não dá conta — quando o que ela não teve foi
// TRABALHO, não capacidade.
//
// ⚠ O NORTE É O MELHOR DIA. Vitor (25/08/2026): "vamos usar o melhor número, ele deve ser o nosso
// norte". Não é média nem percentil: é o que a casa PROVOU que consegue fazer. Meta abaixo disso
// já nasce aceitando o dia ruim.
export const POOLS = {
  PERFIS: { label: "Perfis", kgDia: 14848, pecasDia: 1264 },
  CHAPAS: { label: "Chapas", kgDia: 5113, pecasDia: 3629 },
};
/** o dia bom "de rotina" (p90) — para comparar o norte com o que se repete */
export const POOLS_P90 = {
  PERFIS: { label: "Perfis", kgDia: 6110, pecasDia: 452 },
  CHAPAS: { label: "Chapas", kgDia: 3109, pecasDia: 1135 },
};
/** o dia mediano — é a DEMANDA que houve, não a capacidade. Guardado só para não se perder. */
export const POOLS_MEDIANA = {
  PERFIS: { label: "Perfis", kgDia: 3515, pecasDia: 118 },
  CHAPAS: { label: "Chapas", kgDia: 1719, pecasDia: 375 },
};
export const poolDaPeca = (perfil) => (/^CH/i.test(String(perfil || "").trim()) ? "CHAPAS" : "PERFIS");

const PASSOU_DO_CORTE = ["MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDIDO"];
/** ⚠ `status = "CORTE"` é "ESTÁ no corte", não "foi cortada". Quem fecha é `corteConcluidoEm`. */
export function faltaCortar(p) {
  if (p.corteConcluidoEm) return false;
  if ((Number(p.qteProduzida) || 0) >= (Number(p.qte) || 1)) return false;
  return !PASSOU_DO_CORTE.includes(p.status);
}

/**
 * Agrupa as peças em LOTES indivisíveis: um conjunto (com todos os croquis dele) ou uma avulsa.
 * @param {Array} pecas   peças que faltam cortar, de QUALQUER obra
 * @param {Map}   conjDoCroqui  croquiId → conjuntoId
 */
export function montarLotes(pecas, conjDoCroqui) {
  const lotes = new Map();
  for (const p of pecas) {
    // ⚠ croqui órfão (sem conjunto conhecido) vira lote próprio: melhor cortá-lo isolado do que
    // deixá-lo fora do dia para sempre. São 81 de 2.797 hoje.
    const chave = conjDoCroqui.get(p.id) || `avulsa:${p.id}`;
    const l = lotes.get(chave) || {
      chave, conjuntoId: conjDoCroqui.get(p.id) || null,
      // ⚠ `opNumero` da PEÇA é a FRENTE (T67B), não o número da obra — são coisas diferentes e
      // rotular errado faz o lote parecer de outra OP. A obra vem de fora, em `p.op`.
      opId: p.opId, frente: p.opNumero, op: p.op || null, entrega: p.entrega || null,
      pecas: [], kg: 0, un: 0, porPool: {}, prioridade: null,
    };
    l.pecas.push(p);
    const kg = Number(p.pesoTotalKg) || 0, q = Number(p.qte) || 1, pool = poolDaPeca(p.perfil);
    l.kg += kg; l.un += q;
    l.porPool[pool] = l.porPool[pool] || { kg: 0, un: 0 };
    l.porPool[pool].kg += kg; l.porPool[pool].un += q;
    // a prioridade do lote é a MAIOR entre as peças dele — marcar uma peça puxa o conjunto todo
    if (p.prioridade != null) l.prioridade = l.prioridade == null ? p.prioridade : Math.min(l.prioridade, p.prioridade);
    lotes.set(chave, l);
  }
  return [...lotes.values()];
}

/**
 * MONTA O DIA. Enche até a meta com lotes inteiros, de todas as obras.
 *
 * ⚠ A ORDEM É A DECISÃO: prioridade marcada → entrega mais próxima (inclusive vencida) → lote mais
 * pesado. Entrega vencida vem primeiro porque já custou prazo; peso desempata porque fecha meta com
 * menos manuseio.
 */
export function montarLoteDoDia(lotes, { metaKg = 11818, pools = POOLS } = {}) {
  const capMedida = Object.values(pools).reduce((s, c) => s + c.kgDia, 0) || 1;
  const fator = metaKg / capMedida;
  const teto = Object.fromEntries(Object.entries(pools).map(([k, c]) => [k, {
    label: c.label, kg: c.kgDia * fator, un: Math.max(1, Math.round(c.pecasDia * fator)),
  }]));

  const fila = [...lotes].sort((a, b) => {
    const pa = a.prioridade == null ? 9999 : a.prioridade;
    const pb = b.prioridade == null ? 9999 : b.prioridade;
    if (pa !== pb) return pa - pb;
    const ea = a.entrega ? new Date(a.entrega).getTime() : Infinity;
    const eb = b.entrega ? new Date(b.entrega).getTime() : Infinity;
    if (ea !== eb) return ea - eb;
    return b.kg - a.kg;
  });

  const usado = Object.fromEntries(Object.keys(pools).map((k) => [k, { kg: 0, un: 0 }]));
  const dentro = [], fora = [];
  let kgTotal = 0, unTotal = 0;

  for (const l of fila) {
    // ⚠ o lote entra INTEIRO ou não entra: é o que garante que nada fique aberto.
    const cabe = Object.entries(l.porPool).every(([k, v]) => {
      const t = teto[k]; if (!t) return false;
      return usado[k].un + v.un <= t.un && usado[k].kg + v.kg <= t.kg;
    });
    if (!cabe) { fora.push(l); continue; }
    dentro.push(l);
    for (const [k, v] of Object.entries(l.porPool)) { usado[k].kg += v.kg; usado[k].un += v.un; }
    kgTotal += l.kg; unTotal += l.un;
  }

  // um pool está no teto quando nem o MENOR lote que sobrou dele ainda cabe
  const cheios = new Set();
  for (const [k, t] of Object.entries(teto)) {
    const resta = fora.filter((l) => l.porPool[k]);
    if (!resta.length) continue;
    const menorKg = Math.min(...resta.map((l) => l.porPool[k].kg));
    const menorUn = Math.min(...resta.map((l) => l.porPool[k].un));
    if (usado[k].un + menorUn > t.un || usado[k].kg + menorKg > t.kg) cheios.add(k);
  }

  const ids = dentro.flatMap((l) => l.pecas.map((p) => p.id));
  const obras = [...new Set(dentro.map((l) => l.op).filter(Boolean))];
  const frentes = [...new Set(dentro.map((l) => l.frente).filter(Boolean))];
  return {
    ids, lotes: dentro, fora,
    kg: Math.round(kgTotal), unidades: unTotal, linhas: ids.length,
    conjuntos: dentro.filter((l) => l.conjuntoId).length,
    obras, frentes, metaKg, fator: Math.round(fator * 100) / 100,
    atingiu: kgTotal >= metaKg,
    porPool: Object.fromEntries(Object.entries(usado).map(([k, v]) => [k, {
      label: teto[k].label, kg: Math.round(v.kg), un: v.un,
      tetoKg: Math.round(teto[k].kg), tetoUn: teto[k].un, cheio: cheios.has(k),
    }])),
    // ⚠ dizer POR QUE parou. "Acabou o disponível" é diagnóstico de CARTEIRA, não de fábrica — e é
    // o caso de hoje: 76 t para cortar em toda a casa, 6,5 dias a 260 t/mês.
    motivo: cheios.size ? `${[...cheios].map((k) => teto[k].label).join(" e ")} no teto`
      : kgTotal >= metaKg ? "meta atingida"
      : "acabou o disponível — não há peça suficiente para fechar o dia",
  };
}
