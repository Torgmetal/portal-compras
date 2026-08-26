// PRÉ-SELEÇÃO DO DIA — parte PURA, sem banco, para rodar também no navegador.
//
// Vitor (25/08/2026): "você já deveria trazer uma pré-seleção para cumprir a meta diária de acordo
// com a obra que estamos selecionando no dia".
//
// ⚠ SEM `server-only` e SEM prisma DE PROPÓSITO: a tela precisa recalcular a sugestão a cada
// mudança de filtro, e ir ao servidor a cada clique tornaria o ajuste lento demais para ser usado.

// ⚠ DOIS POOLS, NÃO UM. Medido no Syneco (dia útil, 01/06→24/08/2026, janela com dado íntegro):
// as três lasers de perfil se revezam no mesmo trabalho (perfil W/HP se espalha 54/29/17% entre
// elas) e a chapa é 98% dedicada. Uma capacidade só faria um pacote pesado em chapa saturar a
// LASER CHAPA com as outras três paradas — e ninguém veria isso pelo kg.
export const POOLS = {
  PERFIS: { label: "Perfis", kgDia: 3515, pecasDia: 118 },
  CHAPAS: { label: "Chapas", kgDia: 1719, pecasDia: 372 },
};

export const poolDaPeca = (perfil) => (/^CH/i.test(String(perfil || "").trim()) ? "CHAPAS" : "PERFIS");

/**
 * Enche o dia até a meta, respeitando os DOIS pools.
 *
 * ⚠ A ORDEM É A DECISÃO: prioridade marcada primeiro, depois a fila do corte (`corteOrdem`), depois
 * a peça mais pesada — peça pesada fecha meta com menos manuseio, e é o que a fábrica escolheria.
 *
 * ⚠ PEÇA E KG VALEM IGUAL. Estourar um deles enche o dia do mesmo jeito. Foi por ignorar o limite
 * de PEÇAS que a OP-067 dava 28 dias contando peso e 82 contando peça — o pacote prometeria um dia
 * e entregaria três.
 */
export function sugerirDoDia(pecas, { metaKg = 12000, pools = POOLS } = {}) {
  const fila = [...(pecas || [])].sort((a, b) => {
    const pa = a.prioridade == null ? 9999 : a.prioridade;
    const pb = b.prioridade == null ? 9999 : b.prioridade;
    if (pa !== pb) return pa - pb;
    const ca = a.corteOrdem == null ? 9999 : a.corteOrdem;
    const cb = b.corteOrdem == null ? 9999 : b.corteOrdem;
    if (ca !== cb) return ca - cb;
    return (Number(b.pesoTotalKg) || 0) - (Number(a.pesoTotalKg) || 0);
  });

  // ⚠ A META ESCALA OS DOIS POOLS JUNTOS. A capacidade medida soma 5.234 kg/dia (perfis 3.515 +
  // chapas 1.719). Pedir 12.000 é pedir 2,29× de CADA pool — inclusive no número de peças.
  const capMedida = Object.values(pools).reduce((s, c) => s + c.kgDia, 0) || 1;
  const fator = metaKg / capMedida;
  const teto = Object.fromEntries(Object.entries(pools).map(([k, c]) => [k, {
    label: c.label, kg: c.kgDia * fator, pecas: Math.max(1, Math.round(c.pecasDia * fator)),
  }]));

  const usado = Object.fromEntries(Object.keys(pools).map((k) => [k, { kg: 0, n: 0 }]));
  const ids = [];
  let kgTotal = 0, unTotal = 0;

  // ⚠ NÃO ABANDONA O POOL na primeira peça que não cabe — uma peça menor, mais adiante na fila,
  // ainda entra. Abortar ali deixava o dia com 4,7 t de uma meta de 12 t enquanto o pool de perfil
  // tinha usado 809 kg de 8.059: uma peça pesada não coube e as 1.200 seguintes nem foram olhadas.
  for (const p of fila) {
    const pool = poolDaPeca(p.perfil);
    const t = teto[pool];
    if (!t) continue;
    const u = usado[pool];
    const kg = Number(p.pesoTotalKg) || 0;
    const q = Number(p.qte) || 1;
    if (u.n + q > t.pecas || u.kg + kg > t.kg) continue; // não cabe ESTA; tenta a próxima
    ids.push(p.id);
    u.kg += kg; u.n += q; kgTotal += kg; unTotal += q;
  }

  // um pool está "no teto" quando não cabe mais nem a menor peça dele que sobrou
  const cheios = new Set();
  for (const [k, t] of Object.entries(teto)) {
    const u = usado[k];
    const resto = fila.filter((p) => poolDaPeca(p.perfil) === k && !ids.includes(p.id));
    const menor = resto.reduce((m, p) => Math.min(m, Number(p.pesoTotalKg) || 0), Infinity);
    if (!resto.length) continue;
    if (u.n + 1 > t.pecas || u.kg + menor > t.kg) cheios.add(k);
  }

  return {
    ids, kg: Math.round(kgTotal), pecas: ids.length, unidades: unTotal, metaKg,
    fator: Math.round(fator * 100) / 100,
    porPool: Object.fromEntries(Object.entries(usado).map(([k, v]) => [k, {
      label: teto[k].label, kg: Math.round(v.kg), n: v.n,
      tetoKg: Math.round(teto[k].kg), tetoPecas: teto[k].pecas, cheio: cheios.has(k),
    }])),
    // ⚠ por que parou: pacote que fecha abaixo da meta sem explicação parece erro do sistema
    limite: cheios.size
      ? `${[...cheios].map((k) => teto[k].label).join(" e ")} no teto`
      : kgTotal >= metaKg ? "meta atingida" : "acabou a lista",
  };
}
