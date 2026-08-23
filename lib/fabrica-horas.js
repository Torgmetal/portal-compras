// Conta da fábrica por HORA — pura, sem banco, para rodar também no navegador.
// ─── A FÁBRICA POR HORA ───────────────────────────────────────────────────────
// Vitor (23/08/2026): "vamos seguir dessa maneira, por hora — com base nessas análises vamos
// colocar esses números para o cenário financeiro para vermos o que de fato é".
//
// ⚠ E A LIÇÃO QUE CUSTOU CARO NESTA CONVERSA: HH/t NÃO SE MEDE EM FÁBRICA OCIOSA. Se há 4
// montadores e só 114 t de serviço na frente deles, a conta devolve 6,7 HH/t independentemente de
// o trabalho levar 1,7 ou 6,7 — o que se mediu foi EFETIVO ÷ PRODUÇÃO, não conteúdo de trabalho.
// Foi assim que a rota inteira apareceu com 46 HH/t.
//
// Vitor: "tenho 4 montadores, cada um monta 5 t por dia, só aí daria 440 t". Usando 5 t/dia como
// régua, TODOS os setores aparecem entre 17% e 38% de ocupação — consistente demais para ser
// coincidência. É a assinatura de fábrica limitada por carteira, não por capacidade.
//
// Por isso o HH/t entra como PARÂMETRO do estudo e não como medida: o portal mostra o que mediu,
// mostra o que a régua do chão diz, e deixa a conta rodar nos dois. Quem fecha a questão é
// cronometrar um posto num conjunto real — anotando QUE PEÇA, porque 5 t/dia numa viga pesada e
// 5 t/dia numa treliça leve são mundos diferentes.

// ⚠ OS DOIS CADASTROS NÃO USAM OS MESMOS NOMES. O custo-hora chama de PREPARAÇÃO o setor que o
// Syneco aponta como Corte — e por isso não existe "CORTE" no custo-hora nem "PREPARAÇÃO" viva no
// Syneco. Sem este de-para, o efetivo não encontra a produção e a rota fica pela metade.
const ALIAS = {
  soldagem: "solda", solda: "solda",
  preparacao: "corte", corte: "corte",
  montagem: "montagem",
  jato: "jato", jateamento: "jato",
  pintura: "pintura",
  acabamento: "acabamento",
};
const chaveSetor = (s) => ALIAS[String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim()] || null;

/** Horas por pessoa por mês. ⚠ NÃO usa `ocupacaoPct` da configuração: lá ele está em 80 numa
 *  fórmula que o lê como ABSENTEÍSMO, o que dá 38,5 h/mês — uma hora e meia por dia. */
export const HORAS_PESSOA_MES = Math.round(8.75 * 22 * 0.92 * 10) / 10;

/**
 * A rota, posto a posto: efetivo do custo-hora × produção do Syneco.
 * @returns {{ rota: Array, hhPorTRota: number, pessoas: number }}
 */
export function rotaPorHora(setoresConfig, picos, horasPessoaMes = HORAS_PESSOA_MES, diasUteis = 22) {
  const kgPorChave = {};
  for (const p of picos || []) {
    const k = chaveSetor(p.setor);
    if (k) kgPorChave[k] = p.mediaKgMes || 0;
  }
  const rota = [];
  for (const s of setoresConfig || []) {
    const k = chaveSetor(s.nome);
    if (!k) continue; // ADM e montagem externa não são posto da rota
    const pessoas = Number(s.headcount) || 0;
    const kgMes = kgPorChave[k] || 0;
    if (!pessoas) continue;
    const kgPessoaDia = kgMes > 0 ? kgMes / diasUteis / pessoas : 0;
    // ⚠ isto é EFETIVO ÷ PRODUÇÃO, não conteúdo de trabalho — só vale como piso
    const hhPorT = kgPessoaDia > 0 ? (horasPessoaMes / diasUteis) / (kgPessoaDia / 1000) : 0;
    rota.push({ chave: k, setor: s.nome, pessoas, kgMes, kgPessoaDia: Math.round(kgPessoaDia), hhPorT: Math.round(hhPorT * 10) / 10 });
  }
  return {
    rota,
    hhPorTRota: Math.round(rota.reduce((a, x) => a + x.hhPorT, 0) * 10) / 10,
    pessoas: rota.reduce((a, x) => a + x.pessoas, 0),
  };
}

/**
 * Capacidade a partir de horas e conteúdo de trabalho — e o posto que aperta primeiro.
 *
 * ⚠ O GARGALO SÓ APARECE AQUI. Com um HH/t por posto, a capacidade da fábrica é a do posto mais
 * apertado, não a soma nem a média: na régua de 5 t/dia é a PINTURA, com 3 pessoas.
 */
export function capacidadePorHora({ rota, hhPorTonelada, horasPessoaMes = HORAS_PESSOA_MES, kgPorPessoaDia = 0, diasUteis = 22 }) {
  const pessoas = (rota || []).reduce((a, x) => a + x.pessoas, 0);
  const horas = pessoas * horasPessoaMes;

  // por posto: se veio uma régua de kg/pessoa/dia, cada posto faz pessoas × régua × dias
  const postos = (rota || []).map((x) => ({
    ...x,
    capacidadeKgMes: kgPorPessoaDia > 0
      ? Math.round(x.pessoas * kgPorPessoaDia * diasUteis)
      : (x.hhPorT > 0 ? Math.round((x.pessoas * horasPessoaMes / x.hhPorT) * 1000) : 0),
  })).map((x) => ({ ...x, ocupacaoPct: x.capacidadeKgMes > 0 ? Math.round((x.kgMes / x.capacidadeKgMes) * 100) : 0 }));

  const gargalo = postos.length ? postos.reduce((a, x) => (x.capacidadeKgMes > 0 && x.capacidadeKgMes < a.capacidadeKgMes ? x : a), postos[0]) : null;
  const porRota = Number(hhPorTonelada) > 0 ? Math.round((horas / Number(hhPorTonelada)) * 1000) : 0;

  return {
    pessoas, horas: Math.round(horas), postos, gargalo,
    // ⚠ duas leituras: pela rota inteira (um HH/t só) e pelo posto que aperta. A menor manda.
    capacidadeRotaKgMes: porRota,
    capacidadeKgMes: gargalo && gargalo.capacidadeKgMes > 0 && (porRota === 0 || gargalo.capacidadeKgMes < porRota)
      ? gargalo.capacidadeKgMes : porRota,
  };
}
