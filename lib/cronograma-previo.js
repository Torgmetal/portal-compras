// ─── CRONOGRAMA PRÉVIO DA PROPOSTA ────────────────────────────────────────────────────────────
//
// Vitor (05/09/2026): "após o cenário financeiro precisamos de uma forma de gerar um cronograma
// prévio para compor na proposta e termos uma estimativa de acordo com o tipo da estrutura, ou
// seja, temos que ter um tempo médio para engenharia, compras, produção e, de acordo com a média
// de carga prevista, deixar a representação das cargas e de quantos em quantos dias vamos ter
// entregas".
//
// ⚠⚠ PRAZO NÃO É NÚMERO REDONDO, É RITMO × PESO. Prometer "90 dias" para qualquer obra é como
// cobrar o mesmo preço para 5 e para 300 toneladas. O que a casa tem de constante é o RITMO —
// quantos quilos por dia a engenharia detalha e a fábrica produz — e é dele que sai a duração.
// Os ritmos-padrão vêm medidos das obras que já rodaram (lib/prazos-historicos.js), e cada um pode
// ser mudado no estudo: obra repetida detalha mais rápido, obra com galvanização demora mais.
//
// ⚠ AS FASES SE SOBREPÕEM, e ignorar isso infla o prazo. Compras não espera a engenharia terminar:
// a lista preliminar de material sai com a estrutura ainda em detalhamento — é o que permite o aço
// chegar quando o corte começa. A fabricação é que espera o material.
//
// ⚠ E A ENTREGA NÃO É UM EVENTO, SÃO CARGAS. O cliente monta enquanto a gente fabrica; o que ele
// precisa saber é de quantos em quantos dias chega uma carreta. Esse número sai da produção
// dividida pelo número de cargas — que a aba de Frete já calcula por classe de estrutura.

export const FASES_CRONOGRAMA = [
  { key: "engenharia", nome: "Engenharia", detalhe: "detalhamento e liberação para fabricação", cor: "#6366F1" },
  { key: "compras", nome: "Compras", detalhe: "pedido do aço e chegada no almoxarifado", cor: "#F59E0B" },
  { key: "producao", nome: "Fabricação", detalhe: "corte, montagem, solda, jato e pintura", cor: "#0EA5E9" },
  { key: "expedicao", nome: "Expedição", detalhe: "cargas saindo para a obra", cor: "#10B981" },
];

// ─── ENGENHARIA NÃO É REGRA DE TRÊS, E NÃO PRECISA ACABAR PARA A FÁBRICA COMEÇAR ─────────────
//
// ⚠⚠ Vitor (05/09/2026), vendo a prova de 500 t sair com 173 dias de engenharia: "os números não
// podem ser esses… isso é impagável, precisa ser muito maior esse número. Uma obra de 500 t, por
// exemplo: a lista, que seria nosso marco inicial, nem sempre precisamos estar com 100% para
// podermos liberar. Um projeto desse para a fábrica deveria ter um tempo máximo de 45 dias".
//
// Duas correções, e as duas mudam o desenho do cronograma:
//
//   1. O RITMO MEDIDO NO HISTÓRICO NÃO É O RITMO DA ENGENHARIA. O que lib/prazos-historicos mede é
//      "abertura da OP até a lista ESTAR INTEIRA no portal" — inclui espera de documentação do
//      cliente, revisão de projeto básico e o tempo até alguém importar. Serve para saber quanto
//      uma obra levou; não serve como prazo a vender. O padrão aqui é a META da casa, ancorada no
//      número que ele deu: 500 t detalhadas em 45 dias corridos.
//   2. A LISTA NÃO PRECISA ESTAR 100% PARA LIBERAR. A engenharia libera por frente, e a fábrica
//      corta a primeira assim que a primeira lista desce. Tratar a engenharia como fase que TERMINA
//      antes da fabricação começar somava dois prazos inteiros e produzia a obra de 500 t em três
//      anos — o "impagável".
//
// A curva é base + linear, com teto, e os três números estão na tela:
//   dias úteis de engenharia = min(teto, base + peso ÷ ritmo)
// Com os padrões abaixo: 54 t → 12 dias úteis (17 corridos) · 300 t → 23 (32) · 500 t → 32 (45).
export const PADRAO_CRONOGRAMA = {
  engDiasBase: 9,              // dias úteis de partida (mobilização, projeto básico, plano de corte)
  engenhariaKgDiaUtil: 21700,  // meta: com a base, fecha 500 t em 45 dias corridos
  engDiasMax: 32,              // teto em dias úteis = 45 corridos, o número que o Vitor deu
  liberacaoFabricaPct: 30,     // % da engenharia que já libera a fábrica a começar
  comprasDias: 20,
  comprasInicioPct: 40,
  producaoKgDiaUtil: 1300,
  diasCarregamento: 2,
};

// ⚠ número que vem da TELA chega como "1.700" (ponto de milhar) e número que vem da CONTA chega
// como 12.68. Tratar os dois com o mesmo parser transformava 12.68 em 1268 — foi o que fez o
// intervalo entre entregas sair com 16 dígitos. Número é número; só texto passa pelo parser pt-BR.
const n = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const x = Number(String(v ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(x) ? x : 0;
};
const ceil = (v) => Math.max(1, Math.ceil(v));
const UTEIS_POR_SEMANA = 5;

/** Dias corridos → dias úteis (e o contrário). A semana da fábrica é de 5 dias. */
export const corridosParaUteis = (d) => Math.round((n(d) * UTEIS_POR_SEMANA) / 7);
export const uteisParaCorridos = (d) => Math.round((n(d) * 7) / UTEIS_POR_SEMANA);

/** Soma dias ÚTEIS a uma data, pulando sábado e domingo. */
export function somarDiasUteis(inicio, dias) {
  const d = new Date(inicio);
  let faltam = Math.max(0, Math.round(dias));
  while (faltam > 0) {
    d.setDate(d.getDate() + 1);
    const s = d.getDay();
    if (s !== 0 && s !== 6) faltam--;
  }
  return d;
}

/**
 * O cronograma prévio da obra.
 *
 * @param {object} obra  { pesoKg, cargas, pesoPorCarga }
 * @param {object} cfg   ritmos e prazos (o que a tela deixa editar) + `inicio` (data, opcional)
 * @returns {{ fases, entregas, resumo }} tudo em dias ÚTEIS a partir do dia 0, com as datas
 *          quando `inicio` é informado.
 */
export function montarCronogramaPrevio(obra = {}, cfg = {}) {
  const pesoKg = n(obra.pesoKg);
  const p = { ...PADRAO_CRONOGRAMA, ...Object.fromEntries(Object.entries(cfg).filter(([, v]) => v !== "" && v != null)) };

  const engKgDia = n(p.engenhariaKgDiaUtil) > 0 ? n(p.engenhariaKgDiaUtil) : PADRAO_CRONOGRAMA.engenhariaKgDiaUtil;
  const prodKgDia = n(p.producaoKgDiaUtil) > 0 ? n(p.producaoKgDiaUtil) : PADRAO_CRONOGRAMA.producaoKgDiaUtil;

  // Duração de cada fase, em dias úteis. `engDias`/`prodDias` digitados mandam sobre o ritmo:
  // há obra em que o prazo é dado pelo cliente e o estudo tem de caber nele.
  const teto = n(p.engDiasMax) > 0 ? n(p.engDiasMax) : Infinity;
  const engDias = n(p.engDias) > 0
    ? n(p.engDias)
    : (pesoKg > 0 ? Math.min(teto, ceil(n(p.engDiasBase) + pesoKg / engKgDia)) : 0);
  const comprasDias = corridosParaUteis(n(p.comprasDias));
  const prodDias = n(p.prodDias) > 0 ? n(p.prodDias) : (pesoKg > 0 ? ceil(pesoKg / prodKgDia) : 0);

  const comprasInicio = Math.round((engDias * Math.min(100, Math.max(0, n(p.comprasInicioPct)))) / 100);
  const comprasFim = comprasInicio + comprasDias;
  // ⚠⚠ A FÁBRICA COMEÇA COM A LIBERAÇÃO PARCIAL, não com a engenharia terminada — é o que o Vitor
  // corrigiu. Ela ainda espera o aço: o que manda é o mais tarde entre a primeira lista liberada e
  // o material no almoxarifado.
  const liberado = Math.round((engDias * Math.min(100, Math.max(0, n(p.liberacaoFabricaPct)))) / 100);
  const prodInicio = Math.max(liberado, comprasFim);
  const prodFim = prodInicio + prodDias;

  // ── as cargas ──
  const cargas = Math.max(0, Math.round(n(obra.cargas)));
  const pesoPorCarga = cargas > 0 ? pesoKg / cargas : 0;
  // a primeira carreta só sai quando há peso para enchê-la
  const diasPrimeiraCarga = prodKgDia > 0 && pesoPorCarga > 0 ? Math.min(prodDias, ceil(pesoPorCarga / prodKgDia)) : 0;
  const expInicio = cargas > 0 ? prodInicio + diasPrimeiraCarga : prodFim;
  const expFim = prodFim + corridosParaUteis(n(p.diasCarregamento));
  const intervaloUteis = cargas > 1 ? (expFim - expInicio) / (cargas - 1) : 0;

  const entregas = [];
  for (let i = 0; i < cargas; i++) {
    const dia = cargas === 1 ? expFim : Math.round(expInicio + i * intervaloUteis);
    entregas.push({ n: i + 1, diaUtil: dia, kg: Math.round(pesoPorCarga) });
  }

  const fases = [
    { ...FASES_CRONOGRAMA[0], inicio: 0, dias: engDias },
    { ...FASES_CRONOGRAMA[1], inicio: comprasInicio, dias: comprasDias },
    { ...FASES_CRONOGRAMA[2], inicio: prodInicio, dias: prodDias },
    { ...FASES_CRONOGRAMA[3], inicio: expInicio, dias: Math.max(1, expFim - expInicio) },
  ].map((f) => ({ ...f, fim: f.inicio + f.dias }));

  const totalUteis = Math.max(...fases.map((f) => f.fim), 0);
  const inicio = p.inicio ? new Date(p.inicio) : null;
  const dataDe = (diaUtil) => (inicio && !Number.isNaN(+inicio) ? somarDiasUteis(inicio, diaUtil) : null);

  return {
    fases: fases.map((f) => ({ ...f, dataInicio: dataDe(f.inicio), dataFim: dataDe(f.fim) })),
    entregas: entregas.map((e) => ({ ...e, data: dataDe(e.diaUtil) })),
    resumo: {
      pesoKg, cargas, pesoPorCarga: Math.round(pesoPorCarga),
      engKgDia, prodKgDia,
      totalUteis, totalCorridos: uteisParaCorridos(totalUteis),
      // é isto que o cliente pergunta: de quantos em quantos dias chega uma carreta
      intervaloEntregasCorridos: cargas > 1 ? Math.max(1, uteisParaCorridos(intervaloUteis)) : 0,
      primeiraEntregaCorridos: cargas > 0 ? uteisParaCorridos(entregas[0].diaUtil) : 0,
      dataInicio: inicio && !Number.isNaN(+inicio) ? inicio : null,
      dataFim: dataDe(totalUteis),
    },
  };
}

/**
 * O parágrafo que vai na proposta. Sai pronto para colar — em dias CORRIDOS, que é como o cliente
 * lê contrato, e sem prometer o que o estudo não sabe (data só entra se alguém informou o início).
 */
export function textoDaProposta(cron, { obra } = {}) {
  const r = cron?.resumo;
  if (!r || !r.totalCorridos) return "";
  const partes = [
    `Prazo estimado de ${r.totalCorridos.toLocaleString("pt-BR")} dias corridos a partir da assinatura do contrato e da liberação do projeto básico${obra ? ` para ${obra}` : ""}.`,
  ];
  if (r.cargas > 1) {
    partes.push(
      `A entrega é parcial, em ${r.cargas.toLocaleString("pt-BR")} cargas de aproximadamente ${r.pesoPorCarga.toLocaleString("pt-BR")} kg: ` +
      `a primeira em torno do dia ${r.primeiraEntregaCorridos.toLocaleString("pt-BR")} e as demais a cada ${r.intervaloEntregasCorridos.toLocaleString("pt-BR")} dias, ` +
      `acompanhando a fabricação.`
    );
  } else if (r.cargas === 1) {
    partes.push("A entrega é única, ao final da fabricação.");
  }
  partes.push("Prazo sujeito à confirmação na assinatura, em função da fila de fabricação e do prazo de entrega do aço.");
  return partes.join(" ");
}
