import "server-only";
import { prisma } from "@/lib/prisma";

// ─── A CONVERSA, E A EXECUÇÃO COMO ESTADO ────────────────────────────────────
//
// ⚠⚠ A MENSAGEM DO ASSISTENTE NASCE `EM_ANDAMENTO`, NÃO PRONTA (parecer do Codex, 23/09/2026). A
// duração da função da Vercel inclui o tempo de streaming: a rota pode ser encerrada no meio e
// deixar uma mensagem incompleta que ninguém distingue de uma resposta curta. Com estado, quem
// reabre a conversa vê "interrompida" e sabe que pode perguntar de novo.
//
// ⚠⚠ E A RESERVA DE ORÇAMENTO DE UMA EXECUÇÃO INTERROMPIDA NÃO VOLTA SOZINHA: o custo real é
// desconhecido — pode ter havido consumo. Devolver por padrão transformaria queda de rota num jeito
// de furar o teto.

/** ⚠ Execução parada há mais que isto não está rodando: nenhuma rota da Vercel vive tanto. */
const ABANDONO_MS = 5 * 60 * 1000;

/** ⚠ O título sai da primeira pergunta, cortado — nomear com IA custaria outra chamada para
 *  decorar uma lista lateral. Quem quiser outro nome renomeia. */
const tituloDe = (texto) => {
  const t = String(texto ?? "").replace(/\s+/g, " ").trim();
  return (t.length > 60 ? `${t.slice(0, 57)}…` : t) || "Nova conversa";
};

export async function listarConversas(userId, { limite = 40 } = {}) {
  return prisma.fiscalConversa.findMany({
    where: { userId, status: "ATIVA" },
    // ⚠ Projeção pequena de propósito: a lista lateral não precisa das mensagens, e carregá-las
    // seria a "amplificação de carga" que o Codex apontou para a compute pequena do Neon.
    select: { id: true, titulo: true, updatedAt: true },
    orderBy: { updatedAt: "desc" }, take: limite,
  });
}

/** ⚠⚠ SEMPRE ESCOPADA AO DONO. Conversa de outro usuário não é 403 nem 404 diferente — é `null`,
 *  e a rota devolve 404: dizer "existe mas não é sua" já vaza que existe. */
export async function lerConversa(id, userId) {
  const c = await prisma.fiscalConversa.findFirst({
    where: { id, userId },
    include: { mensagens: { orderBy: { seq: "asc" } } },
  });
  if (!c) return null;
  return { ...c, mensagens: c.mensagens.map(paraTela) };
}

const paraTela = (m) => ({
  id: m.id, papel: m.papel, estado: m.estado, conteudo: m.conteudo,
  blocos: m.blocos ?? [], evidencias: m.evidencias ?? [], avisos: m.avisos ?? [],
  ferramentas: m.ferramentas ?? [], referencias: m.referencias ?? null,
  erro: m.erro, iniciadoEm: m.iniciadoEm, terminadoEm: m.terminadoEm,
});

/**
 * Abre a execução: grava a pergunta e a resposta `EM_ANDAMENTO`, numa transação CURTA.
 *
 * ⚠⚠ A TRANSAÇÃO NÃO FICA ABERTA DURANTE A CHAMADA À API — segurar uma transação do Neon por 30 s
 * de rede externa é exatamente o caminho para o OOM 53200 que este banco já deu.
 *
 * ⚠⚠ A CHAVE DE IDEMPOTÊNCIA DEVOLVE A EXECUÇÃO EXISTENTE em vez de cobrar outra chamada. Reenvio
 * do POST (rede oscilando, usuário tocando duas vezes) é caro aqui: cada tentativa é dinheiro.
 */
export async function abrirExecucao({ conversaId, userId, userNome, pergunta, chave }) {
  return prisma.$transaction(async (tx) => {
    // ⚠⚠⚠ A TRAVA É POR (USUÁRIO, CHAVE), E ELA VEM ANTES DE TUDO (achado do Codex, 24/09/2026).
    // Antes, a conversa era criada PRIMEIRO e a busca da chave só olhava dentro dela — então a
    // PRIMEIRA pergunta não era idempotente: se a conexão caísse antes de o navegador receber o
    // `conversaId`, o reenvio da mesma chave criava OUTRA conversa e OUTRA chamada paga. Justamente
    // o caso em que o reenvio é mais provável: rede ruim na primeira mensagem.
    //
    // ⚠⚠ E A BUSCA SOZINHA NÃO BASTARIA — dois POSTs concorrentes leriam "não existe" os dois. O
    // `pg_advisory_xact_lock` põe o segundo na fila do Postgres até o primeiro terminar; ele então
    // lê a execução já criada. Mesma solução da Conferência de Peça, escopo de TRANSAÇÃO para
    // funcionar com o pooler do Neon.
    //
    // ⚠ Por que não um índice único (userId, chave): `FiscalMensagem` não tem `userId`, e
    // acrescentá-lo seria DDL em produção — que esta rodada de correção não autoriza. A trava
    // resolve sem alterar tabela.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`fiscal-ia:${userId}:${chave}`}))`;

    // ⚠ A busca é por CHAVE dentro das conversas DESTE usuário — não dentro de uma conversa só.
    const anterior = await tx.fiscalMensagem.findFirst({
      where: { chave, conversa: { userId } },
      include: { conversa: true },
    });
    if (anterior) return { repetida: true, conversa: anterior.conversa, resposta: anterior };

    let conversa = conversaId
      ? await tx.fiscalConversa.findFirst({ where: { id: conversaId, userId } })
      : null;
    if (conversaId && !conversa) return { erro: "Conversa não encontrada." };
    conversa ??= await tx.fiscalConversa.create({ data: { userId, userNome, titulo: tituloDe(pergunta) } });

    const ultima = await tx.fiscalMensagem.findFirst({ where: { conversaId: conversa.id }, orderBy: { seq: "desc" }, select: { seq: true } });
    const base = (ultima?.seq ?? 0) + 1;
    await tx.fiscalMensagem.create({ data: { conversaId: conversa.id, seq: base, papel: "USUARIO", conteudo: pergunta, estado: "CONCLUIDA" } });
    const resposta = await tx.fiscalMensagem.create({
      data: { conversaId: conversa.id, seq: base + 1, papel: "ASSISTENTE", chave, estado: "EM_ANDAMENTO" },
    });
    return { conversa, resposta };
    // ⚠ Espera CURTA na trava: disputa aqui só acontece com reenvio duplicado da MESMA chave, que
    // resolve em milissegundos. 15 s de espera comiam um quarto do prazo da rota à toa.
  }, { timeout: 8_000, maxWait: 5_000 });
}

/** Fecha a execução com o resultado — transação curta, depois da chamada. */
export async function concluirExecucao(mensagemId, r) {
  await prisma.$transaction([
    prisma.fiscalMensagem.update({
      where: { id: mensagemId },
      data: {
        estado: "CONCLUIDA", conteudo: r.conteudo, blocos: r.blocos, evidencias: r.evidencias,
        ferramentas: r.ferramentas, referencias: r.referencias, avisos: r.avisos,
        modelo: r.modelo, tokensEntrada: r.uso.entrada, tokensSaida: r.uso.saida,
        custoMicros: r.custoMicros, terminadoEm: new Date(),
      },
    }),
    prisma.fiscalConversa.update({ where: { id: r.conversaId }, data: { updatedAt: new Date() } }),
  ]);
}

export async function falharExecucao(mensagemId, mensagem) {
  await prisma.fiscalMensagem.update({
    where: { id: mensagemId },
    data: { estado: "FALHOU", erro: String(mensagem ?? "").slice(0, 500), terminadoEm: new Date() },
  }).catch(() => {});
}

/**
 * ⚠⚠ EXECUÇÃO ABANDONADA É DETECTADA POR EXPIRAÇÃO, NÃO POR `finally` (parecer do Codex):
 * *"`finally` não é garantia contra encerramento abrupto"*. Se a rota morreu, nenhum código nosso
 * rodou — quem conclui é esta varredura, na próxima leitura da conversa.
 */
export async function reconciliarAbandonadas(conversaId) {
  const limite = new Date(Date.now() - ABANDONO_MS);
  await prisma.fiscalMensagem.updateMany({
    where: { conversaId, estado: "EM_ANDAMENTO", iniciadoEm: { lt: limite } },
    data: { estado: "INTERROMPIDA", erro: "A execução foi encerrada antes de terminar — a resposta não chegou a ser produzida.", terminadoEm: new Date() },
  });
}

export async function renomear(id, userId, titulo) {
  const n = await prisma.fiscalConversa.updateMany({ where: { id, userId }, data: { titulo: tituloDe(titulo) } });
  return n.count > 0;
}

/** ⚠ Arquiva, não apaga: a rastreabilidade do §22 morre junto com a linha. Some da lista da pessoa. */
export async function arquivar(id, userId) {
  const n = await prisma.fiscalConversa.updateMany({ where: { id, userId }, data: { status: "ARQUIVADA" } });
  return n.count > 0;
}
