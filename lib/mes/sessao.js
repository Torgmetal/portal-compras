import "server-only";

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

/**
 * Serializa qualquer leitura+gravação que dispute UM recurso.
 *
 * ⚠⚠ MESMA LIÇÃO DA CONFERÊNCIA DE PEÇA, UM ANDAR ACIMA. Lá, dois "+1" simultâneos na mesma marca
 * passavam os dois porque cada um lia o saldo antes de o outro gravar. Aqui o disputado é o próprio
 * recurso: dois totens (ou dois cliques) abrindo sessão na mesma máquina leem "não há sessão
 * aberta" ao mesmo tempo e criam duas. `pg_advisory_xact_lock` põe o segundo na fila do Postgres
 * até o primeiro terminar a transação, então ele lê o mundo já atualizado.
 *
 * ⚠ Escopo de TRANSAÇÃO, não de sessão de banco — é o que funciona com o pooler do Neon.
 *
 * @param {(tx: import("@prisma/client").Prisma.TransactionClient) => Promise<T>} fn
 * @template T
 */
export async function comTravaDoRecurso(prisma, recursoId, fn) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${recursoId}))`;
    return fn(tx);
  }, { timeout: 15_000, maxWait: 15_000 });
}

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
 * QUANTAS PEÇAS BOAS AINDA CABEM NO PLANEJADO DESTA MARCA.
 *
 * ⚠⚠ O TETO É DA MARCA, NÃO DA SESSÃO. Matheus (11/09/2026): "quando lançar é importante que ele
 * trave a quantidade que dá para lançar comparando na quantidade planejada". `planejadoQtd` é uma
 * CÓPIA feita na abertura — se a sessão de ontem fez 5 das 7 peças, a de hoje abriria achando que
 * tem 7 inteiras pela frente e o lançamento passaria o dobro sem ninguém ver. Mesma lição da
 * Conferência de Peça: lá o teto é da OBRA, não da sessão, e pelo mesmo motivo.
 *
 * ⚠⚠ SÓ AS BOAS CONSOMEM O SALDO (decisão do Matheus, 11/09/2026). Rejeitada e retrabalho são
 * PERDA: a peça passou pela máquina e continua faltando. Se descontassem do planejado, uma refugação
 * alta trancaria a marca antes de ela ficar pronta — o operador ficaria sem como registrar as peças
 * que ainda tem de fazer.
 *
 * ⚠ PLANEJADO ZERO É "SEM TETO", não "não pode nada". É o caso da marca bipada à mão, fora da
 * programação do Gantt — que é o caso comum, não a exceção (ver o vazio da tela de escolha).
 * Tratar 0 como teto faria a trava proibir todo apontamento não programado.
 */
export async function saldoDaMarca(tx, sessao) {
  const planejado = Number(sessao?.planejadoQtd) || 0;
  const semTeto = { planejado: 0, boas: 0, saldo: null, semTeto: true };
  if (planejado <= 0 || !sessao?.marca) return semTeto;

  // A mesma marca pode ter sido produzida em outras sessões (outro turno, outro posto do setor).
  // Sem `opId` a obra vem pelo número — é o que existe quando a marca foi bipada à mão.
  const daObra = sessao.opId ? { opId: sessao.opId } : { opNumero: sessao.opNumero };
  const irmas = await tx.mesSessao.findMany({
    where: { marca: sessao.marca, ...daObra },
    select: { id: true },
  });
  const soma = await tx.mesApontamentoQtd.aggregate({
    where: { sessaoId: { in: irmas.map((s) => s.id) } },
    _sum: { boas: true },
  });
  const boas = soma?._sum?.boas || 0;
  return { planejado, boas, saldo: Math.max(0, planejado - boas), semTeto: false };
}

/**
 * A recusa por estourar o planejado — ou `null` quando o lançamento cabe.
 *
 * ⚠ "FALTAM 0" NÃO É FRASE. Quando o planejado já foi cumprido, o que o operador precisa saber é
 * que a marca acabou (e que quem muda o planejado é o PCP), não uma subtração que deu zero.
 *
 * @returns {string|null}
 */
function recusaPorSaldo(conta, boasPedidas, marca) {
  const boas = Number(boasPedidas) || 0;
  if (conta.semTeto || boas <= conta.saldo) return null;
  if (conta.saldo === 0) return `As ${conta.planejado} peças planejadas de ${marca} já foram lançadas.`;
  return `Planejado ${conta.planejado} pç · já lançadas ${conta.boas} · faltam ${conta.saldo}. Não dá para lançar ${boas}.`;
}

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
 * Abre a sessão — ou devolve a que já está aberta no recurso.
 *
 * ⚠⚠ QUEM CHEGA DEPOIS ENTRA NA SESSÃO QUE EXISTE, não leva erro. É a mesma decisão da Conferência
 * de Peça e, aqui, também a física: a máquina é uma só, e o que está rodando nela está rodando para
 * quem quer que chegue ao totem. Recusar faria o segundo operador achar que o sistema quebrou —
 * quando o certo é ele ver o que a máquina está fazendo (e trocar o operador, se for o caso).
 *
 * O índice parcial `MesSessao_recursoId_aberta_key` é o backstop no banco, não a regra.
 */
export async function abrirSessao(prisma, dados) {
  const { recursoId, operadorId = null, ambiente = "PROD", chaveIdem = null } = dados;
  if (!recursoId) return { erro: "Informe o recurso." };

  return comTravaDoRecurso(prisma, recursoId, async (tx) => {
    const aberta = await tx.mesSessao.findFirst({ where: { recursoId, status: STATUS.ABERTA } });
    if (aberta) return { sessao: aberta, jaExistia: true };

    const sessao = await tx.mesSessao.create({
      data: {
        recursoId, operadorId, ambiente,
        opId: dados.opId ?? null, opNumero: dados.opNumero ?? null,
        marca: dados.marca ?? null, operacao: dados.operacao ?? null,
        planejadoQtd: Number(dados.planejadoQtd) || 0,
        status: STATUS.ABERTA,
      },
    });
    await gravarEvento(tx, { sessao, tipo: ESTADO.PRODUCAO, operadorId, chaveIdem, ambiente });
    return { sessao, jaExistia: false };
  });
}

/**
 * ⚠ A CHAVE DE IDEMPOTÊNCIA É O QUE FAZ REENVIO NÃO VIRAR EVENTO A MAIS. O front gera uma por
 * TENTATIVA (padrão já usado em `app/expedicao/conferencia/[id]/chave-operacao.js`): se a resposta
 * se perder e o operador tocar de novo, chega a MESMA chave e o banco devolve o que já existe.
 *
 * ⚠ Sem chave, grava direto — `@@unique([recursoId, chaveIdem])` não colide com vários NULL no
 * Postgres, então tentar `upsert` sem chave criaria duplicata silenciosa em vez de erro.
 */
async function gravarEvento(tx, { sessao, tipo, operadorId, motivoId = null, detalhe = null, chaveIdem = null, ocorridoEm = new Date(), ambiente = "PROD" }) {
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
export async function mudarEstado(prisma, { sessaoId, tipo, motivoId = null, detalhe = null, operadorId = null, chaveIdem = null, ocorridoEm }) {
  if (!ESTADOS.has(tipo)) return { erro: `Estado desconhecido: ${tipo}` };
  if (tipo === ESTADO.PARADA && !motivoId) return { erro: "Toda parada precisa de um motivo." };
  if (!sessaoId) return { erro: "Informe a sessão." };

  const dono = await prisma.mesSessao.findUnique({ where: { id: sessaoId }, select: { recursoId: true } });
  if (!dono) return { erro: "Sessão não encontrada." };

  return comTravaDoRecurso(prisma, dono.recursoId, async (tx) => {
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
  const { sessaoId, chaveOperacao = null } = dados;
  const valido = validarQuantidade(dados);
  if (!valido.ok) return { erro: valido.erro };
  if (!sessaoId) return { erro: "Informe a sessão." };

  const dono = await prisma.mesSessao.findUnique({ where: { id: sessaoId }, select: { recursoId: true } });
  if (!dono) return { erro: "Sessão não encontrada." };

  return comTravaDoRecurso(prisma, dono.recursoId, async (tx) => {
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
    return { apontamento };
  });
}

/**
 * ⚠ ENCERRAR DUAS VEZES NÃO É ERRO. O toque duplo no botão, ou o reenvio depois de uma resposta
 * perdida, devolve a sessão já encerrada em vez de estourar: o operador queria que ela fechasse, e
 * ela está fechada. Só sessão CANCELADA recusa — ali o desfecho foi outro e esconder isso mentiria.
 */
export async function encerrarSessao(prisma, { sessaoId, operadorId = null, chaveIdem = null }) {
  if (!sessaoId) return { erro: "Informe a sessão." };
  const dono = await prisma.mesSessao.findUnique({ where: { id: sessaoId }, select: { recursoId: true } });
  if (!dono) return { erro: "Sessão não encontrada." };

  return comTravaDoRecurso(prisma, dono.recursoId, async (tx) => {
    const sessao = await tx.mesSessao.findUnique({ where: { id: sessaoId } });
    if (sessao.status === STATUS.ENCERRADA) return { sessao, jaEstava: true };
    if (sessao.status === STATUS.CANCELADA) return { erro: "A sessão foi cancelada." };

    await gravarEvento(tx, { sessao, tipo: ESTADO.ENCERRAMENTO, operadorId, chaveIdem, ambiente: sessao.ambiente });
    const encerrada = await tx.mesSessao.update({
      where: { id: sessaoId },
      data: { status: STATUS.ENCERRADA, encerradaEm: new Date() },
    });
    return { sessao: encerrada, jaEstava: false };
  });
}

/**
 * O que o recurso está fazendo AGORA — o último evento manda.
 *
 * ⚠⚠ SEM EVENTO NÃO É "PARADO", É DESCONHECIDO. Achado do Codex (§7.3): conectividade é uma
 * dimensão SEPARADA do estado produtivo. Máquina que nunca apontou, ou coletor mudo, não é máquina
 * parada — chamar isso de parada envenena o Pareto e a Disponibilidade com tempo que ninguém viveu.
 * Quem lê recebe `desde` para decidir se o dado é velho demais para mostrar.
 */
export async function estadoDoRecurso(prisma, recursoId) {
  const [sessao, evento] = await Promise.all([
    prisma.mesSessao.findFirst({ where: { recursoId, status: STATUS.ABERTA } }),
    prisma.mesEvento.findFirst({ where: { recursoId }, orderBy: { ocorridoEm: "desc" } }),
  ]);
  return {
    sessao: sessao || null,
    estado: evento ? evento.tipo : null,
    desde: evento ? evento.ocorridoEm : null,
  };
}
