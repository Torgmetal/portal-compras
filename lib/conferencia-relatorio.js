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

/** As marcas, com a situação de cada uma e na ordem em que o papel deve ser lido. */
function linhasDe(marcas) {
  const linhas = (marcas || []).map((m) => ({
    marca: m.marca,
    descricao: m.descricao || "",
    previsto: m.previsto,
    conferido: m.conferido,
    saldo: m.saldo,
    situacao: situacaoDe(m),
  }));
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
  const linhas = linhasDe(marcas);
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
