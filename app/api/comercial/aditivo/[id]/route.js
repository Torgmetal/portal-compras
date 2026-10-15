import { NextResponse } from "next/server";
import { z } from "zod";
import { cabecalhoAditivo } from "@/lib/aditivo-esquema";
import { bloqueiosDaExclusao, planoDasReceitas } from "@/lib/aditivo-edicao";
import { salvarReferencias, recalcularRefCliente, termosDaOP } from "@/lib/referencias-op";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

// Editar e excluir um aditivo. Matheus (15/10/2026), na OP-105: "a Patricia criou os aditivos mas as
// OC's estavam erradas e o Rogério revisou. Agora eu precisava revisar o aditivo mas não consigo".
// Vitor: editar vale também para o DIVULGADO; excluir é RECUSADO quando algo já depende do aditivo.
// As regras moram em lib/aditivo-edicao.js. Os itens de VERBA não passam por aqui — já têm a sua
// edição na aba Resumo (aditivo-item/[id]), com RM e solicitação de verba penduradas neles.

const schema = z.object(cabecalhoAditivo);

const carregar = (id) => prisma.aditivo.findUnique({
  where: { id },
  include: {
    _count: { select: { medicoes: true, aceites: true } },
    itens: { select: { _count: { select: { rmItens: true, solicitacoesVerba: true } } } },
    receitas: { orderBy: { ordem: "asc" } },
    referencias: { orderBy: { ordem: "asc" }, select: { papel: true, codigo: true } },
    op: { select: { id: true, cliente: true, clienteId: true } },
  },
});

// o retrato que vai para o AuditLog — o que alguém precisa para reconstruir o aditivo
const retrato = (ad) => ({
  descricao: ad.descricao, valor: ad.valor, dataInicio: ad.dataInicio, dataFimPrevista: ad.dataFimPrevista,
  orcamentoRef: ad.orcamentoRef, referencias: (ad.referencias || []).map((r) => `${r.papel}:${r.codigo}`),
  receitas: (ad.receitas || []).map((r) => ({ descricao: r.descricao, tipoPreco: r.tipoPreco, unidade: r.unidade, quantidade: r.quantidade, valorUnitario: r.valorUnitario, valor: r.valor })),
});

async function autorizar() {
  try {
    return { user: await requireRole(["ADMIN", "COMERCIAL"]) };
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return { erro: NextResponse.json({ error: e.message }, { status }) };
  }
}

const dataOuNull = (s) => (s ? new Date(s) : null);
const camposDaReceita = (r) => ({
  categoria: r.categoria, descricao: r.descricao, tipoPreco: r.tipoPreco,
  unidade: r.tipoPreco === "POR_UNIDADE" ? r.unidade || null : null,
  quantidade: r.tipoPreco === "POR_UNIDADE" ? r.quantidade ?? null : null,
  valorUnitario: r.tipoPreco === "POR_UNIDADE" ? r.valorUnitario ?? null : null,
  valor: Math.round((Number(r.valor) || 0) * 100) / 100,
});

export async function PATCH(req, { params }) {
  const { user, erro } = await autorizar();
  if (erro) return erro;

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: e?.issues?.[0]?.message || "Dados inválidos" }, { status: 400 });
  }

  const ad = await carregar(params.id);
  if (!ad) return NextResponse.json({ error: "Aditivo não encontrado" }, { status: 404 });

  const receitas = (body.receitas || []).filter((r) => String(r.descricao || "").trim() && Number(r.valor) > 0);
  const plano = planoDasReceitas(ad.receitas, receitas);
  const soma = receitas.reduce((s, r) => s + (Number(r.valor) || 0), 0);
  const valor = Number(body.valor) > 0 ? body.valor : soma > 0 ? Math.round(soma * 100) / 100 : null;
  const { termos } = await termosDaOP(ad.op);

  await prisma.$transaction(async (tx) => {
    await tx.aditivo.update({
      where: { id: ad.id },
      data: {
        descricao: body.descricao, valor,
        dataInicio: dataOuNull(body.dataInicio), dataFimPrevista: dataOuNull(body.dataFimPrevista),
        orcamentoPasta: body.orcamentoPasta || null, orcamentoRef: body.orcamentoRef || null,
        propostas: body.propostas || null, estudoArquivo: body.estudoArquivo || null, estudoDados: body.estudoDados || null,
      },
    });
    // ⚠ salvarReferencias troca SÓ o escopo do aditivo (aditivoId) — as OCs do contrato ficam intactas
    await salvarReferencias({ opId: ad.opId, aditivoId: ad.id, entrada: { pedidos: body.pedido?.codigo ? [body.pedido] : [] }, termos, tx });
    for (const r of plano.atualizar) await tx.oPReceita.update({ where: { id: r.id }, data: camposDaReceita(r) });
    if (plano.apagar.length) await tx.oPReceita.deleteMany({ where: { id: { in: plano.apagar }, aditivoId: ad.id } });
    if (plano.criar.length) {
      const ultima = await tx.oPReceita.aggregate({ where: { opId: ad.opId }, _max: { ordem: true } });
      const base = (ultima._max.ordem ?? -1) + 1;
      await tx.oPReceita.createMany({
        data: plano.criar.map((r, i) => ({ ...camposDaReceita(r), observacao: `aditivo ${ad.numero}`, opId: ad.opId, aditivoId: ad.id, ordem: base + i, createdById: user.id })),
      });
    }
  });

  const depois = await carregar(ad.id);
  await prisma.auditLog.create({
    data: { userId: user.id, action: "update_aditivo", entity: "Aditivo", entityId: ad.id, diff: { numero: ad.numero, status: ad.status, antes: retrato(ad), depois: retrato(depois || { ...ad, ...body, valor }) } },
  });

  // divulgado: a tela oferece reenviar o comunicado — quem já assinou leu a versão anterior
  return NextResponse.json({ ok: true, numero: ad.numero, divulgado: ad.status !== "RASCUNHO" });
}

export async function DELETE(req, { params }) {
  const { user, erro } = await autorizar();
  if (erro) return erro;

  const ad = await carregar(params.id);
  if (!ad) return NextResponse.json({ error: "Aditivo não encontrado" }, { status: 404 });

  const motivos = bloqueiosDaExclusao(ad);
  if (motivos.length) return NextResponse.json({ error: `O aditivo ${ad.numero} não pode ser excluído: ${motivos.join("; ")}.`, motivos }, { status: 409 });

  await prisma.$transaction(async (tx) => {
    // ⚠⚠ receitas e OC/TAG apontam para o aditivo com onDelete: SetNull — apagado só o aditivo, elas
    // virariam do CONTRATO em silêncio (receita a mais na obra, OC alheia no refCliente)
    await tx.oPReceita.deleteMany({ where: { aditivoId: ad.id } });
    await tx.oPReferencia.deleteMany({ where: { aditivoId: ad.id } });
    await tx.aditivo.delete({ where: { id: ad.id } });
    await recalcularRefCliente(ad.opId, tx);
  });

  await prisma.auditLog.create({
    data: { userId: user.id, action: "delete_aditivo", entity: "Aditivo", entityId: ad.id, diff: { numero: ad.numero, opId: ad.opId, receitas: ad.receitas.length, antes: retrato(ad) } },
  });
  return NextResponse.json({ ok: true, numero: ad.numero });
}
