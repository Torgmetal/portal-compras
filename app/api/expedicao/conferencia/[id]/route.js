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
import { saldosDaOP, validarLancamento, validarEdicao, progresso, STATUS, autorDe } from "@/lib/conferencia-peca";
import { log } from "@/lib/log";

const registro = log("api/expedicao/conferencia/[id]");
const PERFIS = ["ADMIN", "EXPEDICAO", "PRODUCAO", "QUALIDADE", "PCP", "PLANEJAMENTO"];

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const erroDeAcesso = (e) =>
  NextResponse.json({ success: false, error: e.message },
    { status: e.message === "Unauthorized" ? 401 : 403 });
const erro = (msg, status = 400) => NextResponse.json({ success: false, error: msg }, { status });

const sessaoDe = (id) => prisma.conferenciaPeca.findUnique({
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
});

export async function POST(req, { params }) {
  let user;
  try { user = await requireRole(PERFIS); } catch (e) { return erroDeAcesso(e); }

  const sessao = await sessaoDe(params.id);
  if (!sessao) return erro("Conferência não encontrada", 404);
  if (sessao.status !== STATUS.ABERTA) return erro("Esta conferência já foi encerrada — abra uma nova para continuar.");

  let corpo;
  try { corpo = await req.json(); } catch { corpo = null; }
  const lido = esquemaItem.safeParse(corpo);
  if (!lido.success) return erro(lido.error.issues[0]?.message);

  const saldos = await saldosDaOP(prisma, sessao.opId);
  if (!saldos) return erro("A OP desta conferência não existe mais", 404);

  // ⚠⚠ A VALIDAÇÃO É AQUI, NÃO NO NAVEGADOR. A tela já mostra o saldo e evita a maioria dos erros,
  // mas ela lê um retrato de alguns segundos atrás: com duas pessoas conferindo a mesma obra, o
  // saldo que o celular mostra pode já ter sido consumido. Quem decide é o banco.
  const v = validarLancamento(saldos, { marca: lido.data.marca, qte: lido.data.qte });
  if (!v.ok) return NextResponse.json({ success: false, error: v.erro, recusado: true }, { status: 409 });

  await prisma.conferenciaPecaItem.create({
    data: {
      conferenciaId: sessao.id,
      marca: v.item.marca,           // grava a marca do CADASTRO, não a digitada — sem caixa nem espaço a mais
      qte: lido.data.qte,
      observacao: (lido.data.observacao || "").trim() || null,
      criadoPorNome: autorDe(user).nome,
    },
  });

  registro.info(`${sessao.opNumero}: +${lido.data.qte} de ${v.item.marca}`);
  return NextResponse.json(await estado(sessao));
}

/** A sessão aberta desta rota, ou a resposta de recusa. Repetido em três verbos antes disto. */
async function sessaoAberta(id) {
  const sessao = await sessaoDe(id);
  if (!sessao) return { recusa: erro("Conferência não encontrada", 404) };
  if (sessao.status !== STATUS.ABERTA) return { recusa: erro("Esta conferência já foi encerrada.") };
  return { sessao };
}

/**
 * O lançamento, se ele for MESMO desta conferência.
 * ⚠ Sem a checagem do dono, o id de um lançamento de OUTRA conferência seria editado ou apagado
 * por aqui — o id sozinho não diz a quem pertence.
 */
async function itemDaSessao(itemId, conferenciaId) {
  const item = await prisma.conferenciaPecaItem.findUnique({
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
async function gravarEdicao({ user, sessao, item, dados, mexeuNaObs }) {
  const quem = autorDe(user);
  await prisma.conferenciaPecaItem.update({
    where: { id: item.id },
    data: { qte: dados.qte, ...(mexeuNaObs ? { observacao: (dados.observacao || "").trim() || null } : {}) },
  });
  await prisma.auditLog.create({
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

  const { recusa, sessao } = await sessaoAberta(params.id);
  if (recusa) return recusa;

  let corpo;
  try { corpo = await req.json(); } catch { corpo = null; }
  const lido = esquemaEdicao.safeParse(corpo);
  if (!lido.success) return erro(lido.error.issues[0]?.message);

  const item = await itemDaSessao(lido.data.itemId, sessao.id);
  if (!item) return erro("Lançamento não encontrado nesta conferência", 404);

  const saldos = await saldosDaOP(prisma, sessao.opId);
  if (!saldos) return erro("A OP desta conferência não existe mais", 404);

  const v = validarEdicao(saldos, item, lido.data.qte);
  if (!v.ok) return NextResponse.json({ success: false, error: v.erro, recusado: true }, { status: 409 });

  await gravarEdicao({ user, sessao, item, dados: lido.data, mexeuNaObs: corpo?.observacao !== undefined });
  return NextResponse.json(await estado(sessao));
}

export async function DELETE(req, { params }) {
  let user;
  try { user = await requireRole(PERFIS); } catch (e) { return erroDeAcesso(e); }

  const { recusa, sessao } = await sessaoAberta(params.id);
  if (recusa) return recusa;

  const itemId = new URL(req.url).searchParams.get("item");
  if (!itemId) return erro("Informe qual lançamento apagar.");

  const item = await itemDaSessao(itemId, sessao.id);
  if (!item) return erro("Lançamento não encontrado nesta conferência", 404);

  const quem = autorDe(user);
  await prisma.conferenciaPecaItem.delete({ where: { id: item.id } });
  await prisma.auditLog.create({
    data: {
      userId: quem.id, action: "APAGAR_LANCAMENTO_CONFERENCIA",
      entity: "ConferenciaPeca", entityId: sessao.id,
      diff: { op: sessao.opNumero, marca: item.marca, qte: item.qte, por: quem.nome },
    },
  }).catch(() => {});

  return NextResponse.json(await estado(sessao));
}

const esquemaAcao = z.object({
  acao: z.enum(["finalizar", "cancelar"], { message: "Ação inválida." }),
  observacao: z.string().max(500).optional().nullable(),
});

export async function PATCH(req, { params }) {
  let user;
  try { user = await requireRole(PERFIS); } catch (e) { return erroDeAcesso(e); }

  const { recusa, sessao } = await sessaoAberta(params.id);
  if (recusa) return recusa;

  let corpo;
  try { corpo = await req.json(); } catch { corpo = null; }
  const lido = esquemaAcao.safeParse(corpo);
  if (!lido.success) return erro(lido.error.issues[0]?.message);

  const finalizar = lido.data.acao === "finalizar";
  const quem = autorDe(user);
  const atualizada = await prisma.conferenciaPeca.update({
    where: { id: sessao.id },
    data: {
      status: finalizar ? STATUS.FINALIZADA : STATUS.CANCELADA,
      finalizadaEm: new Date(),
      finalizadaPorNome: quem.nome,
      observacao: (lido.data.observacao || "").trim() || sessao.observacao,
    },
    select: { id: true, status: true },
  });

  await prisma.auditLog.create({
    data: {
      userId: quem.id,
      action: finalizar ? "FINALIZAR_CONFERENCIA_PECA" : "CANCELAR_CONFERENCIA_PECA",
      entity: "ConferenciaPeca", entityId: sessao.id,
      diff: { op: sessao.opNumero, por: quem.nome },
    },
  }).catch(() => {});

  registro.info(`${sessao.opNumero}: conferência ${atualizada.status.toLowerCase()}`);
  return NextResponse.json({ success: true, status: atualizada.status });
}
