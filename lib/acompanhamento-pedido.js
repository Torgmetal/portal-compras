// ─── O ACOMPANHAMENTO DE UM PEDIDO DEPOIS QUE ELE VAI PRO OMIE ───────────────
//
// Matheus (16/09/2026): "preciso ter na tela de RMs que foram geradas pedidos um histórico de
// datas da previsão de entrega para eu ir controlando depois que o pedido vai pro Omie se já foi
// recebido o material ou encaminhado para obra ou liberado para coleta no prazo estimado".
//
// ⚠⚠ A LINHA DO TEMPO JUNTA QUATRO FONTES QUE JÁ EXISTIAM SEPARADAS, e é por isso que ela mora
// aqui e não dentro da tela: a criação do pedido, o prazo ORIGINAL, cada remarcação registrada em
// `PrazoHistorico` e o que o comprador lança em `AcompanhamentoPedido`. Espalhadas, respondem
// "qual é o prazo" e "o que aconteceu" em lugares diferentes — e a pergunta que o pedido existe
// para responder é a comparação entre os dois.
//
// ⚠ O recebimento tem DUAS origens e elas não concordam. O cron do Omie (`lib/omie-recebimento`)
// carimba `statusEntrega`/`dataEntregaReal` sozinho; o comprador lança a etapa à mão. Medido em
// 16/09/2026: 44 pedidos ENTREGUE e 19 PARCIAL vindos do Omie, e ZERO com `recebidoEm` preenchido
// pela tela. Ignorar o Omie faria a linha do tempo dizer "nunca chegou" sobre material que chegou.

/**
 * As etapas que o comprador lança à mão.
 *
 * ⚠ A ordem aqui é a ordem NATURAL do processo, usada só para desempatar dois lançamentos no
 * mesmo dia. Ela não é obrigatória: material que vai direto do fornecedor para a obra nunca passa
 * por "liberado para coleta", e travar a sequência transformaria o registro do que aconteceu numa
 * declaração do que deveria ter acontecido.
 */
export const ETAPAS = {
  LIBERADO_COLETA: { rotulo: "Liberado para coleta", ordem: 1, cor: "sky" },
  ENCAMINHADO_OBRA: { rotulo: "Encaminhado para obra", ordem: 2, cor: "indigo" },
  MATERIAL_RECEBIDO: { rotulo: "Material recebido", ordem: 3, cor: "emerald" },
};

/** As chaves válidas, para o Zod da rota e para a tela montarem o seletor. */
export const ETAPAS_VALIDAS = Object.keys(ETAPAS);

export const rotuloEtapa = (e) => ETAPAS[e]?.rotulo || e;

const dia = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

/** Diferença em dias inteiros entre duas datas (b − a). Negativo = antes. */
function diasEntre(a, b) {
  if (!a || !b) return null;
  const ms = new Date(dia(b)).getTime() - new Date(dia(a)).getTime();
  return Math.round(ms / 86400000);
}

/**
 * A previsão que vale hoje: a última remarcação, ou o prazo previsto do pedido.
 *
 * ⚠ A remarcação mais recente manda, e por isso ela é buscada pela DATA do registro e não pela
 * ordem do array — o histórico pode chegar em qualquer ordem do banco.
 */
export function previsaoAtual(pedido) {
  const hist = [...(pedido?.prazoHistorico || [])]
    .sort((a, b) => new Date(a.criadoEm) - new Date(b.criadoEm));
  const ultima = hist[hist.length - 1];
  return ultima?.prazoNovo || pedido?.prazoEntregaPrevisto || null;
}

/** O recebimento que o Omie carimbou sozinho, se houver. */
function recebimentoDoOmie(pedido) {
  const entregue = ["ENTREGUE", "ATRASADO", "RECEBIDO"].includes(pedido?.statusEntrega);
  const data = pedido?.recebidoEm || pedido?.dataEntregaReal;
  if (!entregue || !data) return null;
  return {
    tipo: "recebimento",
    etapa: "MATERIAL_RECEBIDO",
    data,
    titulo: "Material recebido",
    // ⚠ Diz de ONDE veio. Quem confere precisa saber se o carimbo é do sistema ou de uma pessoa —
    // o do Omie segue a nota fiscal, o da pessoa segue o que ela viu no pátio.
    detalhe: pedido.recebidoPor?.name ? `por ${pedido.recebidoPor.name}` : "pela integração do Omie",
    automatico: !pedido.recebidoPor?.name,
  };
}

/**
 * A linha do tempo completa do pedido, do mais antigo para o mais recente.
 *
 * @param {object} pedido com `prazoHistorico`, `acompanhamentos` e os campos de entrega
 * @returns {{previsao: Date|null, prazoOriginal: Date|null, eventos: object[], atrasoDias: number|null}}
 */
export function linhaDoTempo(pedido) {
  const eventos = [];

  if (pedido?.createdAt) {
    eventos.push({ tipo: "pedido", data: pedido.createdAt, titulo: "Pedido gerado no Omie", detalhe: pedido.numeroPedido ? `#${pedido.numeroPedido}` : "" });
  }

  // ⚠ O prazo original entra como PREVISÃO, não como acontecimento — ele é uma promessa, e a
  // linha do tempo mistura os dois de propósito: é assim que se enxerga a promessa ao lado do que
  // de fato aconteceu naquela data.
  for (const h of pedido?.prazoHistorico || []) {
    eventos.push({
      tipo: "prazo",
      data: h.criadoEm,
      titulo: h.prazoAnterior ? "Previsão remarcada" : "Previsão definida",
      detalhe: [
        h.prazoAnterior ? `de ${dia(h.prazoAnterior)}` : null,
        `para ${dia(h.prazoNovo)}`,
        h.motivo || null,
        h.alteradoPor?.name ? `· ${h.alteradoPor.name}` : null,
      ].filter(Boolean).join(" "),
      prazoNovo: h.prazoNovo,
    });
  }

  for (const a of pedido?.acompanhamentos || []) {
    eventos.push({
      id: a.id,
      tipo: "etapa",
      etapa: a.etapa,
      data: a.data,
      titulo: rotuloEtapa(a.etapa),
      detalhe: [a.observacao, a.registradoPor?.name ? `· ${a.registradoPor.name}` : null].filter(Boolean).join(" "),
      podeDesfazer: true,
    });
  }

  // ⚠ O recebimento do Omie só entra se NINGUÉM lançou "material recebido" à mão. Os dois juntos
  // mostrariam a mesma chegada duas vezes, e quem lançou à mão sabe mais do que o carimbo
  // automático — foi quem estava lá.
  const temRecebidoManual = (pedido?.acompanhamentos || []).some((a) => a.etapa === "MATERIAL_RECEBIDO");
  const doOmie = temRecebidoManual ? null : recebimentoDoOmie(pedido);
  if (doOmie) eventos.push(doOmie);

  eventos.sort((x, y) => {
    const d = new Date(x.data) - new Date(y.data);
    if (d !== 0) return d;
    // Mesmo dia: a ordem natural do processo desempata, senão a lista fica aleatória.
    return (ETAPAS[x.etapa]?.ordem || 0) - (ETAPAS[y.etapa]?.ordem || 0);
  });

  const previsao = previsaoAtual(pedido);
  const chegada = eventos.find((e) => e.etapa === "MATERIAL_RECEBIDO")?.data || null;

  return {
    previsao,
    prazoOriginal: pedido?.prazoOriginal || null,
    eventos,
    // ⚠⚠ O ATRASO SÓ EXISTE DEPOIS QUE CHEGOU. Comparar a previsão com HOJE num pedido que ainda
    // não chegou devolveria um "atraso" que cresce sozinho todo dia — a tela de Entregas já
    // responde "está atrasado?" para o que está em aberto. Aqui a pergunta é outra: chegou dentro
    // do prazo estimado? Sem chegada, não há resposta, e `null` diz isso.
    atrasoDias: chegada && previsao ? diasEntre(previsao, chegada) : null,
  };
}
