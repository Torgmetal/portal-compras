// Uma conferência: o que já foi lançado, o saldo de cada marca, e os lançamentos.
//
// GET                       → sessão + marcas da L.E. com previsto/conferido/saldo + lançamentos
// POST   { marca, qte, observacao } → lança (e RECUSA o que passa da L.E.)
// PUT    { itemId, qte, observacao } → corrige um lançamento já feito, antes de encerrar
// DELETE ?item=xxx          → apaga um lançamento (errou a marca, digitou 10 em vez de 1)
// PATCH  { acao }           → "finalizar" | "cancelar"
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { saldosDaOP, validarLancamento, validarEdicao, progresso, STATUS, autorDe, comTravaDaObra } from "@/lib/conferencia-peca";
import { log } from "@/lib/log";

const registro = log("api/expedicao/conferencia/[id]");
// ⚠ Matheus (09/09/2026): "Todos que tiver acesso ao módulos Expedição pode fazer conferencia" —
// só EXPEDICAO (+ ADMIN), igual ao que `middleware.js` já exige pra abrir a tela. Achado do Codex
// (09/09/2026): a API aceitava mais perfis do que a tela deixava entrar — quem tivesse só
// PRODUCAO/QUALIDADE/PCP/PLANEJAMENTO passava aqui sem conseguir nem abrir a página.
const PERFIS = ["ADMIN", "EXPEDICAO"];

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const erroDeAcesso = (e) =>
  NextResponse.json({ success: false, error: e.message },
    { status: e.message === "Unauthorized" ? 401 : 403 });
const erro = (msg, status = 400) => NextResponse.json({ success: false, error: msg }, { status });

// ⚠ Aceita um client alternativo (a `tx` de dentro de `comTravaDaObra`) — reler o status DA MESMA
// transação travada é o que impede gravar em cima de um "ABERTA" que já não vale mais (achado do
// Codex: "uma sessão encerrada não pode receber mutação que passou por uma leitura antiga de
// status").
const sessaoDe = (id, cliente = prisma) => cliente.conferenciaPeca.findUnique({
  where: { id },
  select: {
    id: true, opId: true, opNumero: true, status: true, observacao: true,
    iniciadaEm: true, iniciadaPorNome: true, finalizadaEm: true, finalizadaPorNome: true,
  },
});

const lancamentosDe = (id) => prisma.conferenciaPecaItem.findMany({
  where: { conferenciaId: id },
  orderBy: { criadoEm: "desc" },
  select: { id: true, marca: true, qte: true, observacao: true, criadoEm: true, criadoPorNome: true },
});

/** O corpo da resposta que a tela consome — sempre o mesmo, para o front nunca ficar defasado. */
async function estado(sessao) {
  const saldos = await saldosDaOP(prisma, sessao.opId);
  if (!saldos) return null;
  const lancamentos = await lancamentosDe(sessao.id);
  return {
    success: true,
    conferencia: sessao,
    op: saldos.op,
    marcas: saldos.marcas,
    lancamentos,
    progresso: progresso(saldos.marcas),
  };
}

export async function GET(_req, { params }) {
  try { await requireRole(PERFIS); } catch (e) { return erroDeAcesso(e); }
  const sessao = await sessaoDe(params.id);
  if (!sessao) return erro("Conferência não encontrada", 404);
  const corpo = await estado(sessao);
  return corpo ? NextResponse.json(corpo) : erro("A OP desta conferência não existe mais", 404);
}

const esquemaItem = z.object({
  marca: z.string().min(1, "Informe a marca da peça."),
  qte: z.coerce.number().int("A quantidade tem que ser um número inteiro.").min(1, "A quantidade mínima é 1."),
  observacao: z.string().max(500).optional().nullable(),
  // ⚠⚠ CHAVE DE IDEMPOTÊNCIA (achado do Codex, 09/09/2026). O front gera uma no primeiro toque em
  // "Lançar" e SÓ troca depois de um sucesso — reenviar (porque a releitura do estado falhou, por
  // exemplo) manda a mesma chave, e a segunda chamada devolve o que já foi gravado em vez de
  // duplicar. Opcional só para não quebrar um cliente antigo em cache; sem ela o pedido ainda é
  // válido, só perde a proteção contra reenvio.
  chaveOperacao: z.string().min(1).max(120).optional(),
});

export async function POST(req, { params }) {
  let user;
  try { user = await requireRole(PERFIS); } catch (e) { return erroDeAcesso(e); }

  let corpo;
  try { corpo = await req.json(); } catch { corpo = null; }
  const lido = esquemaItem.safeParse(corpo);
  if (!lido.success) return erro(lido.error.issues[0]?.message);

  const sessaoFora = await sessaoDe(params.id);
  if (!sessaoFora) return erro("Conferência não encontrada", 404);

  const resultado = await comTravaDaObra(prisma, sessaoFora.opId, async (tx) => {
    // Relida DENTRO da trava: se alguém finalizou a sessão um instante atrás, esta gravação não
    // pode passar por cima usando o "ABERTA" que a checagem de fora ainda viu.
    const sessao = await sessaoDe(sessaoFora.id, tx);
    if (!sessao) return { status: 404, corpo: { success: false, error: "Conferência não encontrada" } };
    if (sessao.status !== STATUS.ABERTA) {
      return { status: 400, corpo: { success: false, error: "Esta conferência já foi encerrada — abra uma nova para continuar." } };
    }

    // Reenvio com a MESMA chave: já foi gravado, não grava de novo — devolve o estado como está.
    if (lido.data.chaveOperacao) {
      const jaExiste = await tx.conferenciaPecaItem.findFirst({
        where: { conferenciaId: sessao.id, chaveOperacao: lido.data.chaveOperacao },
        select: { id: true },
      });
      if (jaExiste) return { status: 200, sessao, repetido: true };
    }

    const saldos = await saldosDaOP(tx, sessao.opId);
    if (!saldos) return { status: 404, corpo: { success: false, error: "A OP desta conferência não existe mais" } };

    // ⚠⚠ A VALIDAÇÃO É AQUI, NÃO NO NAVEGADOR. A tela já mostra o saldo e evita a maioria dos erros,
    // mas ela lê um retrato de alguns segundos atrás: com duas pessoas conferindo a mesma obra, o
    // saldo que o celular mostra pode já ter sido consumido. Quem decide é o banco — e é a TRAVA
    // acima que garante que esta leitura de saldo é a mais recente, não uma que outra requisição
    // concorrente também leu antes de gravar.
    const v = validarLancamento(saldos, { marca: lido.data.marca, qte: lido.data.qte });
    if (!v.ok) return { status: 409, corpo: { success: false, error: v.erro, recusado: true } };

    let novoItem;
    try {
      novoItem = await tx.conferenciaPecaItem.create({
        data: {
          conferenciaId: sessao.id,
          marca: v.item.marca,       // grava a marca do CADASTRO, não a digitada — sem caixa nem espaço a mais
          qte: lido.data.qte,
          observacao: (lido.data.observacao || "").trim() || null,
          criadoPorNome: autorDe(user).nome,
          chaveOperacao: lido.data.chaveOperacao || null,
        },
      });
    } catch (e) {
      // Corrida rara: duas cópias da MESMA chave bateram na trava quase juntas (ex.: dois toques
      // físicos antes do primeiro terminar). A trava por OP já serializa a maioria dos casos, mas
      // o índice único é o backstop — se ele disparar, não é erro, é o reenvio que a chave existe
      // pra pegar.
      if (e.code === "P2002") return { status: 200, sessao, repetido: true };
      throw e;
    }

    await tx.auditLog.create({
      data: {
        userId: autorDe(user).id, action: "LANCAR_CONFERENCIA_PECA",
        entity: "ConferenciaPeca", entityId: sessao.id,
        diff: { op: sessao.opNumero, marca: v.item.marca, qte: lido.data.qte, por: autorDe(user).nome },
      },
    }).catch(() => {});

    return { status: 200, sessao, item: novoItem };
  });

  if (resultado.corpo) return NextResponse.json(resultado.corpo, { status: resultado.status });

  if (!resultado.repetido) registro.info(`${sessaoFora.opNumero}: +${lido.data.qte} de ${lido.data.marca}`);
  return NextResponse.json(await estado(resultado.sessao));
}

/**
 * O lançamento, se ele for MESMO desta conferência.
 * ⚠ Sem a checagem do dono, o id de um lançamento de OUTRA conferência seria editado ou apagado
 * por aqui — o id sozinho não diz a quem pertence.
 */
async function itemDaSessao(itemId, conferenciaId, cliente = prisma) {
  const item = await cliente.conferenciaPecaItem.findUnique({
    where: { id: itemId },
    select: { id: true, conferenciaId: true, marca: true, qte: true },
  });
  return item && item.conferenciaId === conferenciaId ? item : null;
}

const esquemaEdicao = z.object({
  itemId: z.string().min(1, "Informe qual lançamento corrigir."),
  qte: z.coerce.number().int("A quantidade tem que ser um número inteiro.").min(1, "A quantidade mínima é 1."),
  observacao: z.string().max(500).optional().nullable(),
});

/** Grava a correção e o registro de auditoria. ⚠ Guarda ANTES e DEPOIS: sem os dois, a auditoria
 *  diria que a marca tem 3 sem dizer que alguém havia lançado 10. */
async function gravarEdicao({ tx, user, sessao, item, dados, mexeuNaObs }) {
  const quem = autorDe(user);
  await tx.conferenciaPecaItem.update({
    where: { id: item.id },
    data: { qte: dados.qte, ...(mexeuNaObs ? { observacao: (dados.observacao || "").trim() || null } : {}) },
  });
  await tx.auditLog.create({
    data: {
      userId: quem.id, action: "EDITAR_LANCAMENTO_CONFERENCIA",
      entity: "ConferenciaPeca", entityId: sessao.id,
      diff: { op: sessao.opNumero, marca: item.marca, antes: item.qte, depois: dados.qte, por: quem.nome },
    },
  }).catch(() => {});
  registro.info(`${sessao.opNumero}: ${item.marca} corrigida de ${item.qte} para ${dados.qte}`);
}

export async function PUT(req, { params }) {
  let user;
  try { user = await requireRole(PERFIS); } catch (e) { return erroDeAcesso(e); }

  let corpo;
  try { corpo = await req.json(); } catch { corpo = null; }
  const lido = esquemaEdicao.safeParse(corpo);
  if (!lido.success) return erro(lido.error.issues[0]?.message);

  const sessaoFora = await sessaoDe(params.id);
  if (!sessaoFora) return erro("Conferência não encontrada", 404);

  // Mesma trava do POST — corrigir uma quantidade também disputa o saldo da obra com quem estiver
  // lançando ao mesmo tempo, e o mesmo "reler o status por dentro da trava" vale aqui.
  const resultado = await comTravaDaObra(prisma, sessaoFora.opId, async (tx) => {
    const sessao = await sessaoDe(sessaoFora.id, tx);
    if (!sessao) return { status: 404, corpo: { success: false, error: "Conferência não encontrada" } };
    if (sessao.status !== STATUS.ABERTA) {
      return { status: 400, corpo: { success: false, error: "Esta conferência já foi encerrada." } };
    }

    const item = await itemDaSessao(lido.data.itemId, sessao.id, tx);
    if (!item) return { status: 404, corpo: { success: false, error: "Lançamento não encontrado nesta conferência" } };

    const saldos = await saldosDaOP(tx, sessao.opId);
    if (!saldos) return { status: 404, corpo: { success: false, error: "A OP desta conferência não existe mais" } };

    const v = validarEdicao(saldos, item, lido.data.qte);
    if (!v.ok) return { status: 409, corpo: { success: false, error: v.erro, recusado: true } };

    await gravarEdicao({ tx, user, sessao, item, dados: lido.data, mexeuNaObs: corpo?.observacao !== undefined });
    return { status: 200, sessao };
  });

  if (resultado.corpo) return NextResponse.json(resultado.corpo, { status: resultado.status });
  return NextResponse.json(await estado(resultado.sessao));
}

export async function DELETE(req, { params }) {
  let user;
  try { user = await requireRole(PERFIS); } catch (e) { return erroDeAcesso(e); }

  const itemId = new URL(req.url).searchParams.get("item");
  if (!itemId) return erro("Informe qual lançamento apagar.");

  const sessaoFora = await sessaoDe(params.id);
  if (!sessaoFora) return erro("Conferência não encontrada", 404);

  // Mesma trava: apagar também muda o saldo que um lançamento concorrente está lendo.
  const resultado = await comTravaDaObra(prisma, sessaoFora.opId, async (tx) => {
    const sessao = await sessaoDe(sessaoFora.id, tx);
    if (!sessao) return { status: 404, corpo: { success: false, error: "Conferência não encontrada" } };
    if (sessao.status !== STATUS.ABERTA) {
      return { status: 400, corpo: { success: false, error: "Esta conferência já foi encerrada." } };
    }

    const item = await itemDaSessao(itemId, sessao.id, tx);
    if (!item) return { status: 404, corpo: { success: false, error: "Lançamento não encontrado nesta conferência" } };

    const quem = autorDe(user);
    await tx.conferenciaPecaItem.delete({ where: { id: item.id } });
    await tx.auditLog.create({
      data: {
        userId: quem.id, action: "APAGAR_LANCAMENTO_CONFERENCIA",
        entity: "ConferenciaPeca", entityId: sessao.id,
        diff: { op: sessao.opNumero, marca: item.marca, qte: item.qte, por: quem.nome },
      },
    }).catch(() => {});

    return { status: 200, sessao };
  });

  if (resultado.corpo) return NextResponse.json(resultado.corpo, { status: resultado.status });
  return NextResponse.json(await estado(resultado.sessao));
}

const esquemaAcao = z.object({
  acao: z.enum(["finalizar", "cancelar"], { message: "Ação inválida." }),
  observacao: z.string().max(500).optional().nullable(),
});

export async function PATCH(req, { params }) {
  let user;
  try { user = await requireRole(PERFIS); } catch (e) { return erroDeAcesso(e); }

  let corpo;
  try { corpo = await req.json(); } catch { corpo = null; }
  const lido = esquemaAcao.safeParse(corpo);
  if (!lido.success) return erro(lido.error.issues[0]?.message);

  const sessaoFora = await sessaoDe(params.id);
  if (!sessaoFora) return erro("Conferência não encontrada", 404);

  const finalizar = lido.data.acao === "finalizar";
  const quem = autorDe(user);

  // Mesma trava: encerrar não pode passar por cima de um lançamento que está gravando NESTE
  // instante nem deixar dois "finalizar"/"cancelar" simultâneos brigarem pelo status final.
  const resultado = await comTravaDaObra(prisma, sessaoFora.opId, async (tx) => {
    const sessao = await sessaoDe(sessaoFora.id, tx);
    if (!sessao) return { status: 404, corpo: { success: false, error: "Conferência não encontrada" } };
    if (sessao.status !== STATUS.ABERTA) {
      return { status: 400, corpo: { success: false, error: "Esta conferência já foi encerrada." } };
    }

    const atualizada = await tx.conferenciaPeca.update({
      where: { id: sessao.id },
      data: {
        status: finalizar ? STATUS.FINALIZADA : STATUS.CANCELADA,
        finalizadaEm: new Date(),
        finalizadaPorNome: quem.nome,
        observacao: (lido.data.observacao || "").trim() || sessao.observacao,
      },
      select: { id: true, status: true },
    });

    await tx.auditLog.create({
      data: {
        userId: quem.id,
        action: finalizar ? "FINALIZAR_CONFERENCIA_PECA" : "CANCELAR_CONFERENCIA_PECA",
        entity: "ConferenciaPeca", entityId: sessao.id,
        diff: { op: sessao.opNumero, por: quem.nome },
      },
    }).catch(() => {});

    return { status: 200, sessao, atualizada };
  });

  if (resultado.corpo) return NextResponse.json(resultado.corpo, { status: resultado.status });
  const { sessao, atualizada } = resultado;

  registro.info(`${sessao.opNumero}: conferência ${atualizada.status.toLowerCase()}`);
  return NextResponse.json({ success: true, status: atualizada.status });
}
