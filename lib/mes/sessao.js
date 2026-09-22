import "server-only";
import { ambienteValido } from "./ambiente";
import { chaveDoTrabalho } from "@/lib/mes/chave-trabalho";
import { comTravaDoRecurso, comTravaDe } from "@/lib/mes/trava";
import { saldoDaMarca, recusaPorSaldo } from "@/lib/mes/saldo";
import { exigirPresenca, chaveDoCracha } from "@/lib/mes/cracha";

// ⚠ Reexportadas porque a rota do totem e os testes já as importam daqui — mover o arquivo não é
// motivo para mexer em quem chama.
export { comTravaDoRecurso, comTravaDe, saldoDaMarca };

// ─── MES — A SESSÃO DO TOTEM ──────────────────────────────────────────────────
//
// O operador abre a sessão num recurso, produz, para, aponta quantidade e encerra. Esta é a regra
// inteira; a rota e a tela só a chamam.
//
// ⚠⚠ TRÊS NÍVEIS, NÃO UM (achado do Codex, `docs/mes-proprio.md` §7.3, espelhando o próprio Syneco):
//   `MesSessao`         — o operador produzindo uma marca num recurso. Abre e fecha.
//   `MesEvento`         — a transição de estado, num INSTANTE.
//   `MesApontamentoQtd` — a quantidade, INCREMENTAL.
// Juntar os três numa tabela só faria a correção de quantidade reescrever o histórico de estado.
//
// ⚠⚠ O EVENTO É UM INSTANTE, NÃO UM INTERVALO. É a escolha do Syneco, copiada de propósito: a
// duração de um estado é o tempo até o evento SEGUINTE do recurso. Sem campo de fim para
// desencontrar, OEE, tempo decorrido e parada caem todos da mesma fonte.
//
// ⚠ ENCERRAR A SESSÃO NÃO É CONCLUIR A OP. A sessão produz parte do saldo; o resto continua
// disponível para a próxima.

export const STATUS = { ABERTA: "ABERTA", ENCERRADA: "ENCERRADA", CANCELADA: "CANCELADA" };

export const ESTADO = {
  PRODUCAO: "PRODUCAO", SETUP: "SETUP", PARADA: "PARADA", RETRABALHO: "RETRABALHO",
  MANUTENCAO: "MANUTENCAO", FORA_TURNO: "FORA_TURNO", ENCERRAMENTO: "ENCERRAMENTO",
};
const ESTADOS = new Set(Object.values(ESTADO));

const naoNegativo = (n) => Number.isFinite(Number(n)) && Number(n) >= 0;

/**
 * ⚠ QUANTIDADE NEGATIVA É RECUSADA, E CORREÇÃO NÃO SE FAZ ASSIM. Num modelo de eventos, desfazer é
 * um lançamento de CORREÇÃO rastreável (`MesCorrecao`), não um número negativo que some no
 * somatório e não deixa dizer o que aconteceu.
 *
 * ⚠ Lançamento com tudo zero é recusado: não é apontamento, é um clique perdido — e gravado,
 * poluiria o histórico com linhas que não dizem nada.
 */
export function validarQuantidade({ boas = 0, rejeitadas = 0, retrabalho = 0 } = {}) {
  if (![boas, rejeitadas, retrabalho].every(naoNegativo)) {
    return { ok: false, erro: "Quantidade não pode ser negativa nem vazia." };
  }
  if (Number(boas) + Number(rejeitadas) + Number(retrabalho) <= 0) {
    return { ok: false, erro: "Informe ao menos uma peça boa, rejeitada ou de retrabalho." };
  }
  return { ok: true };
}

/**
 * Abre a sessão — ou devolve a que já está aberta no recurso.
 *
 * ⚠⚠ QUEM CHEGA DEPOIS ENTRA NA SESSÃO QUE EXISTE, não leva erro. É a mesma decisão da Conferência
 * de Peça e, aqui, também a física: a máquina é uma só, e o que está rodando nela está rodando para
 * quem quer que chegue ao totem. Recusar faria o segundo operador achar que o sistema quebrou —
 * quando o certo é ele ver o que a máquina está fazendo (e trocar o operador, se for o caso).
 *
 * O índice parcial `MesSessao_recursoId_aberta_key` é o backstop no banco, não a regra.
 */
/** O recurso e o status da sessão, RELIDOS por dentro da trava. */
async function sessaoViva(tx, sessaoId) {
  const sessao = await tx.mesSessao.findUnique({ where: { id: sessaoId } });
  if (!sessao) return { erro: "Sessão não encontrada." };
  // ⚠⚠ RELER O STATUS AQUI DENTRO, não antes da trava. Foi exatamente isto que a Conferência de
  // Peça errou: uma gravação passava por cima de uma sessão que outra chamada tinha acabado de
  // encerrar, porque o status conferido era o de antes da fila.
  if (sessao.status !== STATUS.ABERTA) {
    return { erro: `A sessão já está ${sessao.status.toLowerCase()}.`, sessao };
  }
  return { sessao };
}

/**
 * As chaves de trava de um comando do totem, JUNTAS e em uma só aquisição.
 *
 * ⚠⚠ O CRACHÁ ENTRA NO MESMO CONJUNTO, nunca numa trava aninhada depois (pedido do Codex): pegar o
 * recurso primeiro e o operador lá dentro é como se monta um abraço mortal. `comTravaDe` ordena
 * tudo antes de pedir, então todo comando pede na mesma sequência.
 *
 * ⚠ Sem contexto de presença (scripts, importação do Syneco, testes) a chave do crachá não entra —
 * e a validação também não. A porta que o pedido do Matheus fecha é a do TOTEM, e é ela que sempre
 * manda o contexto.
 */
const chavesCom = (presenca, ...outras) =>
  [presenca?.operadorId ? chaveDoCracha(presenca.operadorId) : null, ...outras];

/** A recusa por crachá, ou `null`. Só roda quando o chamador mandou o contexto de presença. */
const recusaDeCracha = (tx, presenca, recursoId) =>
  (presenca?.operadorId ? exigirPresenca(tx, { ...presenca, recursoId }) : Promise.resolve(null));

export async function abrirSessao(prisma, dados) {
  const { recursoId, presenca = null } = dados;
  if (!recursoId) return { erro: "Informe o recurso." };
  return comTravaDe(prisma, chavesCom(presenca, recursoId), async (tx) => {
    const recusa = await recusaDeCracha(tx, presenca, recursoId);
    if (recusa) return { erro: recusa };
    return abrirNaTransacao(tx, dados);
  });
}

/**
 * A abertura de UM trabalho, já dentro da transação.
 *
 * ⚠⚠ SEPARADA DA TRANSAÇÃO DE PROPÓSITO (pedido do Codex, 13/09/2026). Abrir um lote de marcas
 * chamando `abrirSessao` N vezes daria N transações e N travas: metade do lote podia entrar e a
 * outra metade falhar, deixando a barra pela metade no chão de fábrica. O lote abre tudo numa
 * transação só — ou entra inteiro, ou não entra.
 */
export async function abrirNaTransacao(tx, dados) {
  // ⚠⚠ Sem default: ver o aviso no topo de `lib/mes/ambiente.js`. Ambiente ausente ou fora do
  // domínio é recusa, não "PROD por garantia" — apontamento no mundo errado não se desfaz.
  const { recursoId, operadorId = null, ambiente, chaveIdem = null } = dados;
  if (!ambienteValido(ambiente)) return { erro: "Ambiente do posto não informado." };
  const chaveTrabalho = chaveDoTrabalho(dados.opNumero, dados.marca);

  // ⚠⚠ PROCURA PELO TRABALHO, NÃO PELO RECURSO. Até 13/09/2026 era "existe sessão aberta neste
  // posto?" — e por isso só cabia uma marca por máquina. Agora cabem várias; o que não pode
  // repetir é a MESMA obra+marca no MESMO posto (`chaveTrabalho`), senão os apontamentos se
  // dividem entre duas sessões e ninguém percebe.
  const aberta = await tx.mesSessao.findFirst({
    where: { recursoId, chaveTrabalho, status: STATUS.ABERTA },
  });
  // ⚠⚠ A SESSÃO QUE JÁ EXISTE PASSA A CONTAR TAMBÉM PARA ESTE COMANDO. Sem isto, a barra 3 que
  // repete uma marca da barra 2 "pegaria carona" numa sessão que não sabe dela — e encerrar a barra
  // 2 fecharia a marca que a 3 ainda corta.
  if (aberta) {
    const novoLote = dados.loteId && !aberta.lotes.includes(dados.loteId);
    const novaUnidade = dados.nestingUnidadeId && !aberta.nestingUnidades.includes(dados.nestingUnidadeId);
    const sessao = (novoLote || novaUnidade)
      ? await tx.mesSessao.update({
          where: { id: aberta.id },
          data: {
            lotes: novoLote ? { push: dados.loteId } : undefined,
            nestingUnidades: novaUnidade ? { push: dados.nestingUnidadeId } : undefined,
            // ⚠⚠ O TETO SOMA A BARRA NOVA, E SEM ISSO A SEGUNDA BARRA NASCIA BLOQUEADA (achado do
            // Codex, 22/09/2026). `planejadoQtd` vem da quantidade daquela UNIDADE do nesting, mas
            // o saldo desconta TODAS as sessões da obra+marca+operação. Duas barras com 2 peças da
            // mesma marca ficavam com teto 2 em vez de 4: o operador cortava as 2 primeiras e o
            // portal recusava as 2 legítimas seguintes, dizendo que a marca estava completa.
            //
            // ⚠ Só soma quando a UNIDADE é nova — é dela que o número vem. Somar no `novoLote`
            // também faria o reenvio do mesmo corte com outro id de lote inflar o teto; e o
            // caminho manual (sem unidade) não acumula, porque lá reabrir a marca é reabrir a
            // mesma, não acrescentar peça nenhuma.
            planejadoQtd: novaUnidade ? { increment: Number(dados.planejadoQtd) || 0 } : undefined,
          },
        })
      : aberta;
    return { sessao, jaExistia: true };
  }

  const sessao = await tx.mesSessao.create({
    data: { recursoId, operadorId, ambiente, chaveTrabalho, status: STATUS.ABERTA, ...contexto(dados) },
  });
  if (dados.semEvento !== true) {
    await gravarEvento(tx, { sessao, tipo: ESTADO.PRODUCAO, operadorId, chaveIdem, ambiente });
  }
  return { sessao, jaExistia: false };
}

/** O que a sessão guarda do trabalho — separado só para a abertura caber no teto de complexidade. */
const contexto = (d) => ({
  opId: d.opId ?? null, opNumero: d.opNumero ?? null,
  marca: d.marca ?? null, operacao: d.operacao ?? null, pecaId: d.pecaId ?? null,
  lotes: d.loteId ? [d.loteId] : [], nestingUnidades: d.nestingUnidadeId ? [d.nestingUnidadeId] : [],
  planejadoQtd: Number(d.planejadoQtd) || 0,
});

/**
 * ⚠ A CHAVE DE IDEMPOTÊNCIA É O QUE FAZ REENVIO NÃO VIRAR EVENTO A MAIS. O front gera uma por
 * TENTATIVA (padrão já usado em `app/expedicao/conferencia/[id]/chave-operacao.js`): se a resposta
 * se perder e o operador tocar de novo, chega a MESMA chave e o banco devolve o que já existe.
 *
 * ⚠ Sem chave, grava direto — `@@unique([recursoId, chaveIdem])` não colide com vários NULL no
 * Postgres, então tentar `upsert` sem chave criaria duplicata silenciosa em vez de erro.
 */
async function gravarEvento(tx, { sessao, tipo, operadorId, motivoId = null, detalhe = null, chaveIdem = null, ocorridoEm = new Date(), ambiente }) {
  const data = {
    recursoId: sessao.recursoId, sessaoId: sessao.id, operadorId: operadorId ?? sessao.operadorId,
    tipo, motivoId, detalhe, chaveIdem, ocorridoEm, ambiente,
  };
  if (!chaveIdem) return tx.mesEvento.create({ data });
  return tx.mesEvento.upsert({
    where: { recursoId_chaveIdem: { recursoId: sessao.recursoId, chaveIdem } },
    update: {},
    create: data,
  });
}

/**
 * Troca o estado do recurso (produzindo, parado, em setup…).
 *
 * ⚠ PARADA SEM MOTIVO É RECUSADA. Parada sem motivo não vira Pareto nem OEE honesto — vira uma
 * barra vermelha que ninguém sabe explicar, que é exatamente o que o Syneco entrega hoje quando o
 * operador pula o campo.
 */
export async function mudarEstado(prisma, { sessaoId, tipo, motivoId = null, detalhe = null, operadorId = null, chaveIdem = null, ocorridoEm, presenca = null }) {
  if (!ESTADOS.has(tipo)) return { erro: `Estado desconhecido: ${tipo}` };
  if (tipo === ESTADO.PARADA && !motivoId) return { erro: "Toda parada precisa de um motivo." };
  if (!sessaoId) return { erro: "Informe a sessão." };

  const dono = await prisma.mesSessao.findUnique({ where: { id: sessaoId }, select: { recursoId: true } });
  if (!dono) return { erro: "Sessão não encontrada." };

  // ⚠⚠ O RECURSO CONFERIDO É O DA SESSÃO, não o da URL (pedido do Codex): a ação chega só com
  // `sessaoId`, e conferir o posto da URL deixaria passar um comando do totem A contra uma sessão
  // do totem B.
  return comTravaDe(prisma, chavesCom(presenca, dono.recursoId), async (tx) => {
    const recusa = await recusaDeCracha(tx, presenca, dono.recursoId);
    if (recusa) return { erro: recusa };
    const { sessao, erro } = await sessaoViva(tx, sessaoId);
    if (erro) return { erro };
    const evento = await gravarEvento(tx, {
      sessao, tipo, operadorId, motivoId, detalhe, chaveIdem,
      ocorridoEm: ocorridoEm || new Date(), ambiente: sessao.ambiente,
    });
    return { evento };
  });
}

/**
 * Lança quantidade produzida — SEMPRE INCREMENTAL.
 *
 * ⚠⚠ INCREMENTAL, NÃO ACUMULADO. Se o totem mandasse "o total agora é 12", dois totens ou um
 * reenvio fora de ordem sobrescreveriam um ao outro e o número andaria para trás. Somando
 * lançamentos, cada um é um fato que não desmente os outros — e o acumulado é derivado.
 */
export async function apontarQuantidade(prisma, dados) {
  const { sessaoId, chaveOperacao = null, presenca = null } = dados;
  const valido = validarQuantidade(dados);
  if (!valido.ok) return { erro: valido.erro };
  if (!sessaoId) return { erro: "Informe a sessão." };

  const dono = await prisma.mesSessao.findUnique({
    where: { id: sessaoId }, select: { recursoId: true, chaveTrabalho: true },
  });
  if (!dono) return { erro: "Sessão não encontrada." };

  // ⚠⚠ DUAS TRAVAS: o RECURSO (a máquina é uma só) e o TRABALHO (o teto do planejado é da marca e
  // vale em qualquer posto). Só a do recurso deixava dois postos consumirem o mesmo saldo.
  return comTravaDe(prisma, chavesCom(presenca, dono.recursoId, dono.chaveTrabalho), async (tx) => {
    const recusaCracha = await recusaDeCracha(tx, presenca, dono.recursoId);
    if (recusaCracha) return { erro: recusaCracha };
    const { sessao, erro } = await sessaoViva(tx, sessaoId);
    if (erro) return { erro };

    // ⚠⚠ O REENVIO SAI ANTES DA TRAVA DE SALDO, e esta ordem é o ponto do bloco. A chave de
    // idempotência existe para o toque repetido devolver o que já foi gravado; validando saldo
    // primeiro, o reenvio bateria no teto que ELE MESMO acabou de ocupar e o operador veria "não
    // cabe mais" logo depois de um lançamento que deu certo — justamente o susto que a chave existe
    // para evitar.
    if (chaveOperacao) {
      const jaGravado = await tx.mesApontamentoQtd.findUnique({
        where: { sessaoId_chaveOperacao: { sessaoId, chaveOperacao } },
      });
      if (jaGravado) return { apontamento: jaGravado, jaEstava: true };
    }

    // ⚠ A TRAVA MORA AQUI, DENTRO DA TRAVA DO RECURSO — não na tela. A tela mostra o saldo de
    // alguns segundos atrás; dois totens lançando juntos leriam o mesmo saldo e passariam os dois.
    const conta = await saldoDaMarca(tx, sessao);
    const recusa = recusaPorSaldo(conta, dados.boas, sessao.marca);
    if (recusa) return { erro: recusa, saldo: conta };

    const data = {
      sessaoId, operadorId: dados.operadorId ?? sessao.operadorId,
      boas: Number(dados.boas) || 0, rejeitadas: Number(dados.rejeitadas) || 0,
      retrabalho: Number(dados.retrabalho) || 0,
      observacao: dados.observacao ?? null, chaveOperacao, ambiente: sessao.ambiente,
    };
    const apontamento = chaveOperacao
      ? await tx.mesApontamentoQtd.upsert({
          where: { sessaoId_chaveOperacao: { sessaoId, chaveOperacao } },
          update: {}, create: data,
        })
      : await tx.mesApontamentoQtd.create({ data });

    // ⚠ O SALDO DEPOIS DO LANÇAMENTO vai junto na resposta, e é ele que diz se a marca fechou.
    // Calculado aqui (não relido) porque a linha acabou de ser gravada nesta transação: reler
    // devolveria o mesmo número somando de novo, por mais uma ida ao banco.
    const restante = conta.semTeto ? null : Math.max(0, conta.saldo - data.boas);
    return {
      apontamento,
      saldo: conta.semTeto ? conta : { ...conta, boas: conta.boas + data.boas, saldo: restante },
      concluiu: !conta.semTeto && restante === 0,
    };
  });
}

/**
 * ⚠ ENCERRAR DUAS VEZES NÃO É ERRO. O toque duplo no botão, ou o reenvio depois de uma resposta
 * perdida, devolve a sessão já encerrada em vez de estourar: o operador queria que ela fechasse, e
 * ela está fechada. Só sessão CANCELADA recusa — ali o desfecho foi outro e esconder isso mentiria.
 */
export async function encerrarSessao(prisma, { sessaoId, operadorId = null, chaveIdem = null, presenca = null }) {
  if (!sessaoId) return { erro: "Informe a sessão." };
  const dono = await prisma.mesSessao.findUnique({ where: { id: sessaoId }, select: { recursoId: true } });
  if (!dono) return { erro: "Sessão não encontrada." };

  return comTravaDe(prisma, chavesCom(presenca, dono.recursoId), async (tx) => {
    const recusa = await recusaDeCracha(tx, presenca, dono.recursoId);
    if (recusa) return { erro: recusa };
    return encerrarNaTransacao(tx, sessaoId, { operadorId, chaveIdem });
  });
}

/**
 * ⚠ `semEvento` existe para o LOTE: quando o comando encerra várias marcas de uma vez, o evento é
 * UM e é do recurso (`lib/mes/lote.js`). Gravando um por sessão, o fim de uma barra diria que a
 * máquina parou enquanto as outras marcas ainda produzem.
 */
export async function encerrarNaTransacao(tx, sessaoId, { operadorId = null, chaveIdem = null, semEvento = false } = {}) {
  const sessao = await tx.mesSessao.findUnique({ where: { id: sessaoId } });
  if (!sessao) return { erro: "Sessão não encontrada." };
  if (sessao.status === STATUS.ENCERRADA) return { sessao, jaEstava: true };
  if (sessao.status === STATUS.CANCELADA) return { erro: "A sessão foi cancelada." };

  // ⚠⚠ O ENCERRAMENTO É DO POSTO, E O POSTO SÓ ENCERRA QUANDO A ÚLTIMA MARCA FECHA (achado do
  // Codex, 22/09/2026). `encerrarLote` já tinha essa guarda; o caminho INDIVIDUAL não — e a tela
  // chama `encerrar` sozinha assim que um apontamento conclui uma marca. Num nesting de três
  // marcas, concluir a primeira gravava ENCERRAMENTO enquanto as outras duas ainda produziam: o
  // monitor mostrava a máquina parada, e a duração desse "estado" entrava no OEE como tempo que
  // ninguém viveu (`estadoDoRecurso` lê o ÚLTIMO evento do posto).
  if (!semEvento) {
    const outrasAbertas = await tx.mesSessao.count({
      where: { recursoId: sessao.recursoId, status: STATUS.ABERTA, id: { not: sessaoId } },
    });
    if (outrasAbertas === 0) {
      await gravarEvento(tx, { sessao, tipo: ESTADO.ENCERRAMENTO, operadorId, chaveIdem, ambiente: sessao.ambiente });
    }
  }
  const encerrada = await tx.mesSessao.update({
    where: { id: sessaoId },
    data: { status: STATUS.ENCERRADA, encerradaEm: new Date() },
  });
  return { sessao: encerrada, jaEstava: false };
}

/**
 * O que o recurso está fazendo AGORA — o último evento manda.
 *
 * ⚠⚠ SEM EVENTO NÃO É "PARADO", É DESCONHECIDO. Achado do Codex (§7.3): conectividade é uma
 * dimensão SEPARADA do estado produtivo. Máquina que nunca apontou, ou coletor mudo, não é máquina
 * parada — chamar isso de parada envenena o Pareto e a Disponibilidade com tempo que ninguém viveu.
 * Quem lê recebe `desde` para decidir se o dado é velho demais para mostrar.
 *
 * ⚠⚠ SÃO VÁRIAS SESSÕES desde 13/09/2026: o nesting abre todas as marcas da barra de uma vez no
 * mesmo posto (Matheus: *"tem que ser possível multi marcas ao mesmo tempo numa máquina"*).
 * `sessao` continua saindo daqui como a PRIMEIRA delas, para quem só precisa de uma.
 */
export async function estadoDoRecurso(prisma, recursoId) {
  const [sessoes, evento] = await Promise.all([
    prisma.mesSessao.findMany({
      where: { recursoId, status: STATUS.ABERTA }, orderBy: { abertaEm: "asc" },
    }),
    prisma.mesEvento.findFirst({
      where: { recursoId },
      orderBy: [{ ocorridoEm: "desc" }, { recebidoEm: "desc" }, { id: "desc" }],
    }),
  ]);
  return {
    sessoes,
    sessao: sessoes[0] || null,
    estado: evento ? evento.tipo : null,
    desde: evento ? evento.ocorridoEm : null,
  };
}
