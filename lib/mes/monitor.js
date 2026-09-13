import "server-only";
import { STATUS, ESTADO } from "@/lib/mes/sessao";

// ─── O MONITOR DE MÁQUINAS ────────────────────────────────────────────────────
//
// A tela de cards da supervisão. O contrato é o dataset 131 do Syneco
// (`SKA_Production_GeneralMonitor`, §6.4): Código, Máquina, Setor, OP, Operação, Item, Planejado,
// Operador, Status, Detalhamento, Tempo Decorrido, Produzido, Rejeitado, Retrabalhado, Cor.
//
// ⚠⚠ ISTO SÓ LÊ. Nenhum caminho daqui grava evento, abre ou encerra sessão. É de propósito: o
// monitor fica aberto o dia inteiro numa TV, recarregando sozinho — se ele pudesse escrever,
// qualquer defeito dele viraria apontamento fantasma repetido a cada 15 segundos.
//
// ⚠⚠ SEIS CONSULTAS, NÃO DUAS POR RECURSO. `estadoDoRecurso` responde por UM recurso e faz 2 idas
// ao banco; num laço de 53 postos seriam 106. O monitor pega tudo em bloco — e o desenho precisa
// servir ao Neon depois, cuja compute pequena já estourou memória (53200) com carga menor que essa.

/** Estados em que a máquina está com trabalho em cima — os que sofrem o alerta de sessão velha. */
const PRODUTIVOS = new Set([ESTADO.PRODUCAO, ESTADO.SETUP, ESTADO.RETRABALHO]);

/** Sem sessão aberta e sem evento nenhum: o posto existe no cadastro e nunca disse nada. */
export const DESCONHECIDO = "DESCONHECIDO";
/** Sem sessão aberta, mas com histórico: máquina disponível. Não é parada. */
export const LIVRE = "LIVRE";

/**
 * ⚠ Um turno tem 8-9 h. Sessão produtiva aberta há mais de 12 h atravessou a noite — quase sempre
 * é o operador que foi embora sem encerrar, e o card diria "produzindo" a manhã inteira sem
 * ninguém na máquina. O monitor não conserta isso sozinho (escrever aqui é proibido): ele APONTA.
 */
export const HORAS_SUSPEITAS = 12;

const horasEntre = (agora, quando) => (agora.getTime() - new Date(quando).getTime()) / 3_600_000;

/**
 * O estado do posto, e desde quando.
 *
 * ⚠⚠ TRÊS PROCEDÊNCIAS DE EVENTO, E ELAS NÃO SE MISTURAM (achado do Codex, 13/09/2026). O evento
 * pode ser DA SESSÃO ABERTA (vale, é o que a máquina está fazendo agora), DO RECURSO sem sessão
 * nenhuma (`sessaoId` é opcional no schema — é por aí que entram manutenção e o sinal do CNC: vale
 * também, porque fala da MÁQUINA, não do trabalho) ou DE OUTRA SESSÃO, já encerrada (não vale).
 *
 * A minha primeira versão achatava os três: qualquer evento com a sessão fechada virava LIVRE, e
 * uma máquina EM MANUTENÇÃO apareceria como disponível para o supervisor mandar trabalho.
 *
 * ⚠ Evento de outra sessão com uma sessão aberta por cima é DESCONHECIDO, nunca um chute de
 * PRODUCAO: é dado inconsistente, e inventar o estado é o que faz o monitor mentir.
 */
export function estadoDoCartao(sessao, evento, agora = new Date()) {
  const semNoticia = { estado: DESCONHECIDO, desde: sessao ? sessao.abertaEm : null, detalhe: null };
  if (!evento) return semNoticia;

  const doRecurso = !evento.sessaoId;                            // manutenção, sinal do CNC
  const daSessaoAberta = Boolean(sessao) && evento.sessaoId === sessao.id;
  if (!doRecurso && !daSessaoAberta) {
    // Evento de uma sessão que não é a aberta. Com sessão aberta por cima, é dado inconsistente;
    // sem sessão nenhuma, é o rastro da sessão passada — a máquina está livre.
    return sessao ? semNoticia : { estado: LIVRE, desde: evento.ocorridoEm, detalhe: null };
  }

  // ⚠ ENCERRAMENTO é o fim do trabalho, não um estado da máquina: o que fica é "livre".
  const estado = evento.tipo === ESTADO.ENCERRAMENTO ? LIVRE : evento.tipo;
  return {
    estado,
    desde: evento.ocorridoEm,
    detalhe: detalheDoEvento(evento),
    ...(sessao ? alertaDeSessaoVelha(estado, sessao, agora) : {}),
  };
}

const detalheDoEvento = (evento) => evento.motivo?.descricao || evento.detalhe || null;

function alertaDeSessaoVelha(estado, sessao, agora) {
  if (!PRODUTIVOS.has(estado)) return {};
  const horas = horasEntre(agora, sessao.abertaEm);
  if (horas < HORAS_SUSPEITAS) return {};   // ⚠ 12 h EXATAS já alertam, como diz a regra.
  return { alerta: `Sessão aberta há ${Math.floor(horas)} h — confira se alguém esqueceu de encerrar.` };
}

/**
 * O cartão de UM posto, já pronto para a tela.
 *
 * ⚠ MANDA `desde` (o instante), NÃO o tempo decorrido em minutos. Número calculado no servidor
 * congela entre uma atualização e outra: a TV mostraria "12 min" parado por 15 segundos, depois
 * pularia para 13. O relógio é do navegador; o fato é do servidor.
 *
 * ⚠⚠ NÃO EXISTE CAMPO DE SALDO AQUI, e a ausência é a decisão (achado do Codex, 13/09/2026). O
 * monitor enxerga UMA sessão; `saldoDaMarca`, que é quem manda no totem, soma TODAS as sessões da
 * mesma obra+marca. Numa marca de 10 com 6 feitas ontem e 2 hoje, o monitor diria "faltam 8" e o
 * totem "faltam 2" — duas verdades sobre o mesmo número, na mesma fábrica, e o chão acreditaria na
 * que estivesse mais perto. Produzido é DA SESSÃO e está dito assim; saldo volta quando for
 * calculado pela mesma conta do totem.
 */
export function cartaoDoRecurso(recurso, dados = {}, agora = new Date()) {
  const { sessao = null, evento = null, somas = null, peca = null } = dados;
  const { estado, desde, detalhe, alerta = null } = estadoDoCartao(sessao, evento, agora);
  return {
    id: recurso.id, codigo: recurso.codigo, nome: recurso.nome,
    setor: setorDoCartao(recurso.setor),
    temTerminal: recurso.temTerminal !== false,
    estado, desde, detalhe, alerta,
    ...trabalhoDoCartao(sessao, peca),
    ...numerosDoCartao(somas),
  };
}

const setorDoCartao = (setor) => (setor ? { codigo: setor.codigo, nome: setor.nome } : null);

const trabalhoDoCartao = (sessao, peca) => {
  const s = sessao || {};
  const p = peca || {};
  return {
    operador: s.operador?.nome || null,
    obra: s.opNumero || null,
    marca: s.marca || null,
    operacao: s.operacao || null,
    descricao: p.descricao || p.perfil || null,
    planejado: Number(s.planejadoQtd) || 0,
  };
};

const numerosDoCartao = (somas) => ({
  produzido: somas?.boas || 0,
  rejeitado: somas?.rejeitadas || 0,
  retrabalho: somas?.retrabalho || 0,
});

/**
 * ⚠⚠ O ÚLTIMO EVENTO VEM JUNTO COM O RECURSO (`take: 1` na relação), e isso resolve duas armadilhas
 * de uma vez, ambas apontadas pelo Codex: (a) buscar o evento por igualdade de `ocorridoEm` — o
 * caminho `groupBy(_max)` + `OR` de pares que eu tinha escrito primeiro — falha CALADO se a coluna
 * guardar precisão que o `Date` do JavaScript não carrega, e o posto apareceria "SEM REGISTRO" sem
 * erro nenhum na tela; (b) dois eventos no mesmo milissegundo não tinham desempate, e o card
 * piscaria entre dois estados a cada atualização. Aqui a ordem é TOTAL: `ocorridoEm`, `recebidoEm`,
 * `id` — o `id` garante estabilidade, não causalidade, e é só para isso que ele está aí.
 */
const ULTIMO_EVENTO = {
  orderBy: [{ ocorridoEm: "desc" }, { recebidoEm: "desc" }, { id: "desc" }],
  take: 1,
  select: {
    id: true, sessaoId: true, tipo: true, ocorridoEm: true, detalhe: true,
    motivo: { select: { descricao: true } },
  },
};

/**
 * O panorama inteiro da fábrica, agrupado por setor na ordem da cadeia física.
 *
 * ⚠ AS CONSULTAS NÃO COMPARTILHAM UM RETRATO ÚNICO, e isso é aceito de propósito: uma sessão que
 * abre entre a primeira e a última leitura pode aparecer por um ciclo com o evento novo e a
 * quantidade velha. A tela se corrige sozinha na atualização seguinte (segundos), e prender uma
 * transação `RepeatableRead` a cada poll de uma TV ligada o dia inteiro custaria conexão no Neon —
 * cuja compute pequena já estourou memória com carga menor que essa. Se um dia doer, é aqui.
 */
export async function panoramaDaFabrica(prisma, { ambiente = "PROD", agora = new Date() } = {}) {
  const recursos = await prisma.mesRecurso.findMany({
    where: { ativo: true, ambiente },
    include: {
      setor: { select: { codigo: true, nome: true, ordem: true, cor: true } },
      eventos: ULTIMO_EVENTO,
    },
    orderBy: [{ setor: { ordem: "asc" } }, { nome: "asc" }],
  });
  if (!recursos.length) return { setores: [], resumo: resumir([]), lidoEm: agora.toISOString() };

  const sessoes = await prisma.mesSessao.findMany({
    where: { recursoId: { in: recursos.map((r) => r.id) }, status: STATUS.ABERTA },
    include: { operador: { select: { nome: true } } },
  });

  const [somas, pecas] = await Promise.all([
    somasPorSessao(prisma, sessoes.map((s) => s.id)),
    pecasDasSessoes(prisma, sessoes),
  ]);

  const porRecurso = new Map(sessoes.map((s) => [s.recursoId, s]));
  const cartoes = recursos.map((r) => {
    const sessao = porRecurso.get(r.id) || null;
    return cartaoDoRecurso(r, {
      sessao,
      evento: r.eventos?.[0] || null,
      somas: sessao ? somas.get(sessao.id) : null,
      peca: sessao?.pecaId ? pecas.get(sessao.pecaId) : null,
    }, agora);
  });

  return { setores: agruparPorSetor(recursos, cartoes), resumo: resumir(cartoes), lidoEm: agora.toISOString() };
}

async function somasPorSessao(prisma, sessaoIds) {
  const somas = new Map();
  if (!sessaoIds.length) return somas;
  const linhas = await prisma.mesApontamentoQtd.groupBy({
    by: ["sessaoId"],
    where: { sessaoId: { in: sessaoIds } },
    _sum: { boas: true, rejeitadas: true, retrabalho: true },
  });
  for (const l of linhas) {
    somas.set(l.sessaoId, {
      boas: l._sum?.boas || 0, rejeitadas: l._sum?.rejeitadas || 0, retrabalho: l._sum?.retrabalho || 0,
    });
  }
  return somas;
}

/** A descrição do item vem de `PecaConjunto` — a sessão guarda só a marca. */
async function pecasDasSessoes(prisma, sessoes) {
  const achadas = new Map();
  const ids = [...new Set(sessoes.map((s) => s.pecaId).filter(Boolean))];
  if (!ids.length) return achadas;
  const pecas = await prisma.pecaConjunto.findMany({
    where: { id: { in: ids } },
    select: { id: true, descricao: true, perfil: true },
  });
  for (const p of pecas) achadas.set(p.id, p);
  return achadas;
}

function agruparPorSetor(recursos, cartoes) {
  // ⚠ Casa por `id`, não por posição no vetor (`cartoes[i]`/`recursos[i]`): hoje os dois vêm do
  // mesmo `map` e batem, mas no dia em que alguém filtrar ou reordenar um dos lados, os cards
  // trocariam de setor sem erro nenhum na tela.
  const doRecurso = new Map(recursos.map((r) => [r.id, r.setor]));
  const porSetor = new Map();
  for (const c of cartoes) {
    const setor = doRecurso.get(c.id);
    const chave = setor?.codigo || "—";
    if (!porSetor.has(chave)) {
      porSetor.set(chave, { codigo: chave, nome: setor?.nome || "Sem setor", cor: setor?.cor || null, postos: [] });
    }
    porSetor.get(chave).postos.push(c);
  }
  return [...porSetor.values()];
}

/**
 * ⚠ O resumo conta PARADO separado de LIVRE e de SEM REGISTRO. Somar os três em "não produzindo"
 * é o número que o Syneco entrega hoje e que não serve para agir: parada é problema para resolver
 * agora, livre é máquina esperando trabalho, sem registro é posto que ninguém sabe.
 */
export function resumir(cartoes) {
  const conta = { total: cartoes.length, produzindo: 0, parado: 0, setup: 0, livre: 0, semRegistro: 0, alertas: 0 };
  for (const c of cartoes) {
    if (c.estado === ESTADO.PRODUCAO) conta.produzindo += 1;
    else if (c.estado === ESTADO.PARADA) conta.parado += 1;
    else if (c.estado === ESTADO.SETUP) conta.setup += 1;
    else if (c.estado === LIVRE) conta.livre += 1;
    else if (c.estado === DESCONHECIDO) conta.semRegistro += 1;
    if (c.alerta) conta.alertas += 1;
  }
  return conta;
}
