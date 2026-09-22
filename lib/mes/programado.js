import "server-only";
import { AMBIENTE } from "./ambiente";

/** O mundo do posto — a fronteira do isolamento é o RECURSO (ver `lib/mes/ambiente.js`). */
const ambienteDe = (recurso) => recurso?.ambiente || AMBIENTE.PROD;
import { CAMPO } from "@/lib/gantt-pcp";
import { RECURSOS } from "@/app/pcp/producao/_gantt/recursos";

// ─── O QUE O PCP PROGRAMOU PARA ESTE RECURSO ──────────────────────────────────
//
// Matheus (10/09/2026): "tem o Gantt que o Vitor fez para programar produção da fábrica, nele
// podemos usar para liberar as marcas em cada máquina/bancada".
//
// ⚠⚠ ISTO É O QUE O NOSSO MES FAZ E O SYNECO NÃO PODE FAZER. O totem do Syneco PERGUNTA ao operador
// qual marca ele vai produzir — ele tem que saber, digitar, e o sistema aceita o que vier. O nosso
// já sabe: o Gantt grava dia e recurso na própria peça, e é só ler. A tela mostra o trabalho em vez
// de cobrar que o operador o conheça de cor.
//
// ⚠ NÃO EXISTE PROGRAMAÇÃO NOVA AQUI. Os campos são os mesmos que o Gantt escreve
// (`lib/gantt-pcp.js`, `CAMPO`). Criar um modelo próprio de "programação do totem" faria o portal
// ter duas verdades sobre o mesmo dia — o erro que `lib/baixa-syneco.js` documenta ter custado caro.

/**
 * Setor do MES → os campos que o Gantt usa.
 *
 * ⚠ PREPARACAO aponta para CAMPO.CORTE: o setor foi renomeado (Matheus, 10/09/2026), mas as colunas
 * de `PecaConjunto` continuam `corteDiaProgramado`/`maquina`. Renomear coluna de 21.772 linhas para
 * acompanhar um rótulo de tela seria trocar risco real por estética.
 */
const CAMPO_DO_SETOR = {
  PREPARACAO: CAMPO.CORTE,
  MONTAGEM: CAMPO.MONTAGEM,
  SOLDA: CAMPO.SOLDA,
  ACABAMENTO: CAMPO.ACABAMENTO,
  JATO: CAMPO.JATO,
  PINTURA: CAMPO.PINTURA,
};

const fimDoDia = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

const SELECAO = {
  id: true, marca: true, descricao: true, qte: true, pesoTotalKg: true, perfil: true,
  opNumero: true, opId: true,
};

/**
 * As marcas programadas para este recurso até o fim do dia.
 *
 * ⚠⚠ `lte`, NÃO `equals` — atrasado continua na fila. Se a peça foi programada para ontem e não
 * saiu, ela não deixou de ser trabalho: some da tela e o operador vai perguntar por que o portal
 * "esqueceu". Programado para depois de hoje fica de fora, senão o totem vira lista de desejos.
 *
 * ⚠ A COBERTURA DO GANTT É FINA (246 peças com bancada de montagem, 168 de solda, de 21.772). Ele
 * programa o horizonte próximo, não o backlog — por isso a tela PRECISA do caminho alternativo de
 * bipar livre. Recurso sem programação hoje é o caso comum, não a exceção.
 *
 * @param {{codigo:string, setor:{codigo:string}}} recurso
 */
export async function programadoPara(prisma, recurso, dia = new Date()) {
  const setorGantt = SETOR_GANTT_DO_MES[recurso?.setor?.codigo] || recurso?.setor?.codigo;
  const campos = CAMPO_DO_SETOR[recurso?.setor?.codigo];
  if (!campos) return { lotes: [], semMapa: true };

  // ⚠⚠ O TOTEM DO ACABAMENTO NUNCA MOSTRAVA NADA (achado em 13/09/2026, pela tela de cadastro). O
  // Gantt planeja em BALDE onde a capacidade é kg/dia: grava `acabamentoBancada = "ACABAMENTO"` (83
  // peças) e `pinturaBancada = "GALPAO_1"` (3). O MES cadastra os postos FÍSICOS — ACABAMENTO01…10,
  // PINTURAAIRLESS — porque o chão teve 7 postos apontando no mesmo dia e uma sessão por recurso
  // travaria o segundo operador. As duas decisões estão certas; o que faltava era o encaixe.
  //
  // ⚠⚠ O VÍNCULO ENTRE PLANEJAR E EXECUTAR É O SETOR — está escrito no próprio semeador. Quando o
  // posto NÃO é um código que o Gantt conhece, a lista passa a ser a do SETOR inteiro. Continuar
  // filtrando pelo código do posto dava "nada programado para este posto hoje" todos os dias, para
  // sempre, sem erro nenhum na tela — a pior espécie de falha.
  const doSetor = !ehCodigoDoGantt(setorGantt, recurso.codigo);
  const where = doSetor
    ? { [campos.dia]: { not: null, lte: fimDoDia(dia) } }
    : { [campos.recurso]: recurso.codigo, [campos.dia]: { not: null, lte: fimDoDia(dia) } };

  const pecas = await prisma.pecaConjunto.findMany({
    where,
    select: { ...SELECAO, [campos.dia]: true },
    orderBy: [{ [campos.dia]: "asc" }, { marca: "asc" }],
  });

  const feito = await produzidoPorMarca(prisma, pecas, ambienteDe(recurso));
  return { lotes: agruparPorObra(pecas, campos.dia, feito), semMapa: false, doSetor };
}

/** O setor do MES → o do Gantt (só a Preparação difere: lá ainda se chama CORTE). */
const SETOR_GANTT_DO_MES = { PREPARACAO: "CORTE" };

/**
 * Este código é um posto que o Gantt conhece?
 *
 * ⚠ `k: null` na lista do Gantt é a opção "sem bancada / atribuir" da tela dele — opção de
 * interface, não recurso. Contá-la aqui faria um posto sem código parecer conhecido.
 */
function ehCodigoDoGantt(setorGantt, codigo) {
  const lista = RECURSOS[setorGantt] || [];
  const alvo = String(codigo ?? "").trim().toUpperCase();
  return lista.some((r) => r.k && String(r.k).toUpperCase() === alvo);
}

/**
 * A MESMA OBRA, ESCRITA DE DUAS MANEIRAS. A sessão guarda `opId` quando a marca veio da lista do
 * Gantt e só `opNumero` quando foi bipada à mão — casar só por `opId` perderia justamente os
 * apontamentos do caminho de bipar, que é o caminho comum.
 */
const mesmaObra = (sessao, peca) =>
  sessao.opId && peca.opId
    ? sessao.opId === peca.opId
    : (sessao.opNumero || "") === (peca.opNumero || "");

/**
 * Quantas peças BOAS cada marca já tem lançadas, somando TODAS as sessões dela.
 *
 * ⚠⚠ É O QUE FAZ A LISTA DIZER "PRODUZIDA". Matheus (11/09/2026): "quando o operador lançar 100%
 * das peças planejadas naquela marca deve marcar como concluído (…) e na listagem marcar que aquela
 * marca foi produzida". Sem isto, o operador que termina uma marca volta para a lista e vê tudo
 * igual ao que era antes de começar — e a próxima dúvida é se o lançamento foi perdido.
 *
 * ⚠ Só BOAS contam, pela mesma razão do teto em `saldoDaMarca`: retrabalho é peça que continua
 * faltando, e marcar a marca como pronta por causa dele mentiria para o PCP.
 *
 * @returns {Promise<Map<string, number>>} id da peça → boas já lançadas
 */
async function produzidoPorMarca(prisma, pecas, ambiente) {
  const feito = new Map();
  const marcas = [...new Set(pecas.map((p) => p.marca).filter(Boolean))];
  if (!marcas.length) return feito;

  // ⚠⚠ MESMO VAZAMENTO DO `saldoDaMarca` (achado do Codex, 21/09/2026): a busca é por MARCA, não
  // por recurso, então sem o ambiente a lista do totem real mostraria como produzido o que uma
  // simulação lançou — e a marca sumiria da fila de quem tem de fazê-la.
  const sessoes = await prisma.mesSessao.findMany({
    where: { marca: { in: marcas }, ambiente },
    select: { id: true, marca: true, opId: true, opNumero: true },
  });
  if (!sessoes.length) return feito;

  const somas = await prisma.mesApontamentoQtd.groupBy({
    by: ["sessaoId"],
    where: { sessaoId: { in: sessoes.map((s) => s.id) } },
    _sum: { boas: true },
  });
  const porSessao = new Map(somas.map((s) => [s.sessaoId, s._sum.boas || 0]));

  for (const p of pecas) {
    const total = sessoes
      .filter((s) => s.marca === p.marca && mesmaObra(s, p))
      .reduce((soma, s) => soma + (porSessao.get(s.id) || 0), 0);
    if (total > 0) feito.set(p.id, total);
  }
  return feito;
}

/**
 * ⚠ `>=`, não `===`: marca com apontamento maior que o planejado (dado antigo, planejado reduzido
 * depois) está pronta do mesmo jeito. Exigir igualdade a mostraria como pendente para sempre, e o
 * operador tentaria produzir o que já existe.
 */
function marcaDaLista(p, campoDia, feitas) {
  const qte = p.qte || 0;
  return {
    id: p.id, marca: p.marca, descricao: p.descricao || p.perfil || "",
    qte, kg: p.pesoTotalKg || 0, dia: p[campoDia],
    feitas, concluida: qte > 0 && feitas >= qte,
  };
}

/** A fábrica enxerga por obra ("a 102 na montagem 1 hoje"), então a tela agrupa igual. */
function agruparPorObra(pecas, campoDia, feito = new Map()) {
  const porObra = new Map();
  for (const p of pecas) {
    const chave = p.opNumero || "—";
    if (!porObra.has(chave)) {
      porObra.set(chave, { opNumero: chave, opId: p.opId, marcas: [], pecas: 0, kg: 0, concluidas: 0 });
    }
    const lote = porObra.get(chave);
    const marca = marcaDaLista(p, campoDia, feito.get(p.id) || 0);
    lote.marcas.push(marca);
    lote.pecas += marca.qte;
    lote.kg += p.pesoTotalKg || 0;
    if (marca.concluida) lote.concluidas += 1;
  }
  return [...porObra.values()];
}

/**
 * O caminho de quando não há programação: o operador bipa a marca.
 *
 * ⚠⚠ BIPAR NÃO É CAMPO LIVRE. A marca é procurada em `PecaConjunto` e só existe o que está lá — o
 * totem não deixa nascer apontamento contra uma marca que a obra não tem. É a mesma regra da
 * Conferência de Peça ("não está na Lista de Expedição"), e a razão é a mesma: dado digitado errado
 * no pátio vira relatório errado no escritório, semanas depois.
 *
 * ⚠ Ordena por exatidão — marca exata, depois as que começam com o texto. Bipar `T102A1` põe
 * T102A1 na frente sem sumir com T102A15, que é o que quem está no meio da digitação vai escolher.
 */
export async function acharMarca(prisma, termo, limite = 12) {
  const texto = String(termo ?? "").trim().toUpperCase();
  if (texto.length < 2) return [];

  const achadas = await prisma.pecaConjunto.findMany({
    where: { marca: { contains: texto, mode: "insensitive" } },
    select: SELECAO,
    take: 60,
  });

  const nota = (m) => (m === texto ? 0 : m.startsWith(texto) ? 1 : 2);
  return achadas
    .sort((a, b) => nota(a.marca.toUpperCase()) - nota(b.marca.toUpperCase()) || a.marca.localeCompare(b.marca))
    .slice(0, limite)
    .map((p) => ({
      id: p.id, marca: p.marca, descricao: p.descricao || p.perfil || "",
      qte: p.qte || 0, kg: p.pesoTotalKg || 0, opNumero: p.opNumero, opId: p.opId,
    }));
}
