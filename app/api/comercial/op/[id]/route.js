import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { normalizarEscopo } from "@/lib/qualidade-escopo";
import { requireRole } from "@/lib/session";
import { dataBR } from "@/lib/data-br";
import { log } from "@/lib/log";

const registro = log("api/comercial/op/[id]");

// Aceita 2 modos:
// 1. Status change: { acao: "finalizar" | "reabrir" | "cancelar" }
// 2. Edit cadastral: { numero?, cliente?, obra?, descricao?, dataInicio?, dataFimPrevista? }
const patchAcaoSchema = z.object({
  acao: z.enum(["finalizar", "reabrir", "cancelar"]),
});
const patchEditSchema = z.object({
  numero: z.string().min(1).optional(),
  cliente: z.string().min(1).optional(),
  obra: z.string().nullable().optional(),
  refCliente: z.string().nullable().optional(),
  descricao: z.string().nullable().optional(),
  dataInicio: z.string().nullable().optional(),
  dataFimPrevista: z.string().nullable().optional(),
  valorTotalContrato: z.number().min(0).nullable().optional(),
  valorFaturarPorKg: z.number().min(0).nullable().optional(),
  estoqueMaterial: z.enum(["PROPRIO_TORG", "CLIENTE_TERCEIRO"]).nullable().optional(),
  tipoDataBook: z.enum(["PADRAO_TORG", "SNQC", "RELATORIO_ACOMPANHAMENTO"]).nullable().optional(),
  escopoQualidade: z.array(z.string()).nullable().optional(),
  // vínculo com o orçamento do Comercial — as OPs antigas também precisam ser ligadas
  // (Vitor 19/08: "as OPs já criadas vamos conseguir vincular elas também?")
  orcamentoPasta: z.string().nullable().optional(),
  orcamentoRef: z.string().nullable().optional(),
  propostas: z.any().nullable().optional(),
  estudoArquivo: z.any().nullable().optional(),
  estudoDados: z.any().nullable().optional(),
});

export async function PATCH(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMERCIAL"]);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  const op = await prisma.oP.findUnique({ where: { id: params.id } });
  if (!op) return NextResponse.json({ error: "OP nao encontrada" }, { status: 404 });

  // ── Modo 1: mudanca de status ──
  if (body.acao) {
    let parsed;
    try {
      parsed = patchAcaoSchema.parse(body);
    } catch {
      return NextResponse.json({ error: "Acao invalida" }, { status: 400 });
    }

    let dataUpdate = {};
    if (parsed.acao === "finalizar") {
      dataUpdate = { status: "ENCERRADA", dataFimReal: new Date() };
    } else if (parsed.acao === "reabrir") {
      dataUpdate = { status: op.dataInicio ? "EM_EXECUCAO" : "ABERTA", dataFimReal: null };
    } else if (parsed.acao === "cancelar") {
      dataUpdate = { status: "CANCELADA" };
    }

    const updated = await prisma.oP.update({ where: { id: params.id }, data: dataUpdate });

    // Quando OP eh ENCERRADA ou CANCELADA: cancela reservas de estoque
    // ativas dessa OP — qty volta pro estoque livre.
    if (parsed.acao === "finalizar" || parsed.acao === "cancelar") {
      const motivo = parsed.acao === "finalizar"
        ? `OP encerrada em ${dataBR(new Date())}`
        : `OP cancelada em ${dataBR(new Date())}`;
      await prisma.estoqueReserva.updateMany({
        where: { opId: op.id, status: "ATIVA" },
        data: { status: "CANCELADA", cancelMotivo: motivo },
      }).catch((e) => registro.erro("[op finalizar - cancelar reservas]", e?.message));
    }

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: `op_${parsed.acao}`,
        entity: "OP",
        entityId: op.id,
        diff: { numero: op.numero, statusAnterior: op.status, statusNovo: updated.status },
      },
    });

    return NextResponse.json({ ok: true, status: updated.status });
  }

  // ── Modo 2: edicao de campos cadastrais ──
  let edit;
  try {
    edit = patchEditSchema.parse(body);
  } catch {
    return NextResponse.json({ error: "Dados invalidos" }, { status: 400 });
  }

  const dataUpdate = {};
  if (edit.numero !== undefined) {
    const novoNumero = edit.numero.trim().toUpperCase();
    if (novoNumero !== op.numero) {
      // Garante unicidade
      const existe = await prisma.oP.findUnique({ where: { numero: novoNumero } });
      if (existe && existe.id !== op.id) {
        return NextResponse.json(
          { error: `Já existe outra OP com o número ${novoNumero}.` },
          { status: 409 }
        );
      }
      dataUpdate.numero = novoNumero;
    }
  }
  if (edit.cliente !== undefined) dataUpdate.cliente = edit.cliente.trim();
  if (edit.obra !== undefined) dataUpdate.obra = edit.obra?.trim() || null;
  if (edit.refCliente !== undefined) dataUpdate.refCliente = edit.refCliente?.trim() || null;
  if (edit.descricao !== undefined) dataUpdate.descricao = edit.descricao?.trim() || null;
  if (edit.dataInicio !== undefined) {
    dataUpdate.dataInicio = edit.dataInicio ? new Date(edit.dataInicio) : null;
  }
  if (edit.dataFimPrevista !== undefined) {
    dataUpdate.dataFimPrevista = edit.dataFimPrevista ? new Date(edit.dataFimPrevista) : null;
  }
  if (edit.valorTotalContrato !== undefined) {
    dataUpdate.valorTotalContrato = edit.valorTotalContrato;
  }
  if (edit.valorFaturarPorKg !== undefined) {
    dataUpdate.valorFaturarPorKg = edit.valorFaturarPorKg;
  }
  if (edit.estoqueMaterial !== undefined) dataUpdate.estoqueMaterial = edit.estoqueMaterial || null;
  if (edit.tipoDataBook !== undefined) dataUpdate.tipoDataBook = edit.tipoDataBook || null;
  if (edit.escopoQualidade !== undefined) dataUpdate.escopoQualidade = normalizarEscopo(edit.escopoQualidade);
  for (const c of ["orcamentoPasta", "orcamentoRef", "propostas", "estudoArquivo", "estudoDados"]) {
    if (edit[c] !== undefined) dataUpdate[c] = edit[c] ?? null;
  }

  if (Object.keys(dataUpdate).length === 0) {
    return NextResponse.json({ ok: true, semMudancas: true });
  }

  await prisma.oP.update({ where: { id: op.id }, data: dataUpdate });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "edit_op",
      entity: "OP",
      entityId: op.id,
      diff: {
        antes: {
          numero: op.numero,
          cliente: op.cliente,
          obra: op.obra,
        },
        depois: dataUpdate,
      },
    },
  });

  return NextResponse.json({ ok: true });
}

// DELETE — exclusao definitiva, so permite se nao tiver RMs vinculadas
export async function DELETE(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMERCIAL"]);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const op = await prisma.oP.findUnique({
    where: { id: params.id },
    include: {
      _count: { select: { rms: true, aditivos: true, revisoes: true, ajustesPrazo: true } },
    },
  });
  if (!op) return NextResponse.json({ error: "OP nao encontrada" }, { status: 404 });

  if (op._count.rms > 0) {
    return NextResponse.json(
      {
        error: `Nao da pra excluir: a OP ${op.numero} tem ${op._count.rms} RM(s) vinculada(s). Use 'Cancelar' pra arquivar mantendo o historico.`,
      },
      { status: 409 }
    );
  }

  // Cascateia: cronograma, aditivos (e seus itens), revisoes, ajustes, itens da OP.
  // SolicitacaoVerba cascateia automatico via OPItem/AditivoItem (onDelete: Cascade no schema).
  //
  // ⚠ O CRONOGRAMA precisa sair aqui. A FK `Cronograma.opId` e ON DELETE **SET NULL**: a exclusao
  // da OP nao falhava, ela deixava o cronograma ORFAO — com `opId` nulo, `opNumero` preservado e
  // `ativo: true`, continuando na lista do Planejamento como se a obra existisse. Vitor (19/08):
  // "quando eu excluir uma OP, exclua o cronograma dela tambem". Tarefas, revisoes, cobrancas,
  // envios e registros vao junto por cascade do proprio Cronograma.
  //
  // Pega tambem o cronograma criado a mao que ficou sem `opId` mas aponta pro mesmo numero
  // (a tela grava como "T116"); sem isso ele sobreviveria orfao e reapareceria na fila da TV.
  const numeroT = /^T/i.test(op.numero) ? op.numero.toUpperCase() : `T${op.numero}`;
  let cronogramasRemovidos = 0;
  await prisma.$transaction(async (tx) => {
    const r = await tx.cronograma.deleteMany({
      where: { OR: [{ opId: op.id }, { opId: null, opNumero: { in: [op.numero, numeroT] } }] },
    });
    cronogramasRemovidos = r.count;
    await tx.aditivoItem.deleteMany({ where: { aditivo: { opId: op.id } } });
    await tx.aditivo.deleteMany({ where: { opId: op.id } });
    await tx.revisao.deleteMany({ where: { opId: op.id } });
    await tx.ajustePrazo.deleteMany({ where: { opId: op.id } });
    await tx.oPItem.deleteMany({ where: { opId: op.id } });
    await tx.oP.delete({ where: { id: op.id } });
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "delete_op",
      entity: "OP",
      entityId: op.id,
      diff: {
        numero: op.numero,
        cliente: op.cliente,
        cronogramas: cronogramasRemovidos,
        aditivos: op._count.aditivos,
        revisoes: op._count.revisoes,
      },
    },
  });

  return NextResponse.json({ ok: true });
}
