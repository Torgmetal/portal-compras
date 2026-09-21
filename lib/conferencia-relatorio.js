// ─── O RELATÓRIO DE UMA CONFERÊNCIA DE PEÇA ──────────────────────────────────
//
// Matheus (16/09/2026): "ajuste as conferências que ele finalizar para ser possível gerar um PDF ou
// Excel dessa listagem de peças conferidas".
//
// ⚠⚠ O DOCUMENTO MOSTRA A OBRA INTEIRA, NÃO SÓ O QUE FOI BIPADO. Um papel que lista apenas as
// marcas conferidas responde "o que passou" e esconde a pergunta que a expedição de fato faz na
// hora de carregar: "o que ainda falta?". A conferência pode ser finalizada com saldo em aberto —
// e é justamente esse saldo que precisa estar escrito, senão o documento certifica um carregamento
// completo que não aconteceu. Por isso toda marca da Lista de Expedição entra, com a SITUAÇÃO ao
// lado, e o resumo diz quantas ficaram para trás.
//
// ⚠ Os números vêm de `saldosDaOP` — a MESMA conta que a tela mostra e que valida o lançamento.
// Recalcular aqui faria o papel divergir da tela no dia em que a regra mudasse.

/** Situação de uma marca no fim da conferência. A ordem é a de gravidade. */
export const SITUACAO = {
  COMPLETA: "completa",
  PARCIAL: "parcial",
  NAO_CONFERIDA: "nao-conferida",
};

const ROTULO = {
  [SITUACAO.COMPLETA]: "Conferida",
  [SITUACAO.PARCIAL]: "Parcial",
  [SITUACAO.NAO_CONFERIDA]: "Não conferida",
};

/** O rótulo de uma situação, como sai no PDF e no Excel. */
export const rotuloSituacao = (s) => ROTULO[s] || s;

const situacaoDe = (m) => {
  if (m.conferido >= m.previsto) return SITUACAO.COMPLETA;
  return m.conferido > 0 ? SITUACAO.PARCIAL : SITUACAO.NAO_CONFERIDA;
};

/** Os campos da sessão que o documento imprime. */
function dadosDaSessao(sessao) {
  const s = sessao || {};
  return {
    id: s.id,
    status: s.status,
    observacao: s.observacao || "",
    iniciadaEm: s.iniciadaEm || null,
    iniciadaPorNome: s.iniciadaPorNome || "",
    finalizadaEm: s.finalizadaEm || null,
    finalizadaPorNome: s.finalizadaPorNome || "",
  };
}

/** O que a expedição precisa ler antes de carregar o caminhão. */
function resumoDe(linhas) {
  const soma = (campo) => linhas.reduce((s, l) => s + (Number(l[campo]) || 0), 0);
  const conta = (situacao) => linhas.filter((l) => l.situacao === situacao).length;
  const previsto = soma("previsto");
  const conferido = soma("conferido");
  return {
    marcas: linhas.length,
    previsto,
    conferido,
    // ⚠ O peso total do que foi conferido — o número que o PCP leva para o romaneio.
    pesoConferidoKg: Math.round(soma("pesoConferidoKg") * 100) / 100,
    saldo: Math.max(0, previsto - conferido),
    completas: conta(SITUACAO.COMPLETA),
    parciais: conta(SITUACAO.PARCIAL),
    naoConferidas: conta(SITUACAO.NAO_CONFERIDA),
    // ⚠ Sem peça prevista não existe "0% conferido" — existe obra sem lista. Zero aqui seria uma
    // acusação; `null` deixa o documento escrever "—".
    percentual: previsto > 0 ? Math.round((conferido / previsto) * 100) : null,
    pendente: conferido < previsto,
  };
}

/**
 * As observações que o operador escreveu, agrupadas POR MARCA.
 *
 * ⚠⚠ ELAS ESTAVAM SÓ NO HISTÓRICO, e o histórico é cronológico. Matheus (17/09/2026) quer a
 * planilha para montar romaneio: quem lê a linha da marca precisa ver ali mesmo o "chegou
 * amassada" que alguém digitou às 14h, sem caçar no rodapé. Uma marca bipada três vezes junta as
 * três observações — descartar as repetidas perderia justamente a que difere.
 */
function obsPorMarca(lancamentos) {
  const mapa = new Map();
  for (const l of lancamentos || []) {
    const obs = String(l.observacao || "").trim();
    if (!obs) continue;
    const chave = String(l.marca || "").trim().toUpperCase();
    if (!mapa.has(chave)) mapa.set(chave, []);
    mapa.get(chave).push(obs);
  }
  return mapa;
}

/**
 * O que ESTA conferência lançou, por marca — quantidade e o dia do último lançamento.
 *
 * ⚠⚠ É A PERGUNTA QUE A PLANILHA NÃO RESPONDIA. `conferido` na linha da marca é o ACUMULADO DA
 * OBRA (`conferidoPorMarca` soma todas as conferências não canceladas), mas `lancamentos` é só
 * desta sessão. Quem recebe a segunda remessa via "Conferido 10" e não tinha como saber que 7 já
 * tinham ido na semana passada. Matheus (21/09/2026): "para quando ele for mandando parcial eles
 * não se confundirem com o que já foi mandado no dia anterior".
 *
 * ⚠ A DATA SOZINHA NÃO RESOLVE: a marca com 7 antigas e 3 de hoje sairia com a data de hoje e o
 * número 10, que é exatamente a leitura errada. Por isso vai a QUANTIDADE junto.
 *
 * ⚠ Marca lançada em mais de um dia na MESMA conferência leva o dia do ÚLTIMO lançamento — o
 * detalhe por lançamento já está na aba "Lançamentos", e é lá que se olha quando o número não bate.
 */
function remessaPorMarca(lancamentos) {
  const mapa = new Map();
  for (const l of lancamentos || []) {
    const chave = String(l.marca || "").trim().toUpperCase();
    const atual = mapa.get(chave) || { qte: 0, em: null };
    atual.qte += Number(l.qte) || 0;
    const em = l.criadoEm ? new Date(l.criadoEm) : null;
    if (em && (!atual.em || em > atual.em)) atual.em = em;
    mapa.set(chave, atual);
  }
  return mapa;
}

/** Uma linha da tabela. Em função própria para o `map` não estourar o teto de complexidade. */
function montarLinha(m, obs, remessa) {
  const chave = String(m.marca || "").trim().toUpperCase();
  const daRemessa = remessa.get(chave) || null;
  return {
    marca: m.marca,
    descricao: m.descricao || "",
    previsto: m.previsto,
    conferido: m.conferido,
    saldo: m.saldo,
    situacao: situacaoDe(m),
    pesoUnitKg: Number(m.pesoUnitKg) || 0,
    // ⚠⚠ O PESO É O DO QUE FOI CONFERIDO, não o do previsto. A planilha vira romaneio, e romaneio
    // pesa o que sobe no caminhão. Usar o previsto declararia carga que talvez não exista.
    pesoConferidoKg: Math.round((Number(m.pesoUnitKg) || 0) * (Number(m.conferido) || 0) * 100) / 100,
    observacoes: (obs.get(chave) || []).join(" · "),
    // ⚠ Zero e "nada" são estados DIFERENTES: marca não tocada nesta conferência não ganha "0",
    // que na planilha pareceria contagem feita que deu zero.
    nestaRemessaQte: daRemessa?.qte || 0,
    nestaRemessaEm: daRemessa?.em || null,
  };
}

/** As marcas, com a situação de cada uma e na ordem em que o papel deve ser lido. */
function linhasDe(marcas, lancamentos) {
  const obs = obsPorMarca(lancamentos);
  const remessa = remessaPorMarca(lancamentos);
  const linhas = (marcas || []).map((m) => montarLinha(m, obs, remessa));
  // ⚠ Ordem do documento: o que FALTA primeiro. Quem abre este papel no pátio está procurando
  // pendência, não confirmação — e pendência no fim de uma lista de 500 marcas não é lida.
  const peso = { [SITUACAO.NAO_CONFERIDA]: 0, [SITUACAO.PARCIAL]: 1, [SITUACAO.COMPLETA]: 2 };
  linhas.sort((a, b) => (peso[a.situacao] - peso[b.situacao])
    || String(a.marca).localeCompare(String(b.marca), "pt-BR", { numeric: true }));
  return linhas;
}

/**
 * Os dados do relatório — a fonte única do PDF e do Excel.
 *
 * ⚠ Um só lugar monta isto de propósito: dois documentos que contam a mesma conferência não podem
 * discordar em número nenhum. O que muda entre eles é só o desenho.
 *
 * @param {object} sessao       a linha de `ConferenciaPeca`
 * @param {object} op           `{ numero, cliente, obra }`
 * @param {object[]} marcas     o que `saldosDaOP` devolveu
 * @param {object[]} lancamentos cada bipe, do mais recente para o mais antigo
 */
export function montarRelatorio({ sessao, op, marcas, lancamentos }) {
  const linhas = linhasDe(marcas, lancamentos);
  return {
    op: { numero: op?.numero ?? null, cliente: op?.cliente || "", obra: op?.obra || "" },
    sessao: dadosDaSessao(sessao),
    linhas,
    // ⚠ `lancamentos` vem do mais recente para o mais antigo (é o que a tela precisa); no papel a
    // ordem é a do turno: primeiro bipe em cima, como quem lê um histórico espera.
    lancamentos: [...(lancamentos || [])].reverse(),
    resumo: resumoDe(linhas),
  };
}

/** O nome do arquivo — o mesmo nos dois formatos, para não virar dois documentos diferentes. */
export function nomeDoArquivo(rel, extensao) {
  const op = String(rel.op.numero ?? "").padStart(3, "0");
  const quando = rel.sessao.finalizadaEm || rel.sessao.iniciadaEm || new Date();
  const dia = new Date(quando).toISOString().slice(0, 10);
  return `Conferencia_OP-${op}_${dia}.${extensao}`;
}
