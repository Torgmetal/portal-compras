import { NextResponse } from "next/server";
import { z } from "zod";
import { receitasDoAditivo } from "@/lib/receita-aditivo";
import { cabecalhoAditivo } from "@/lib/aditivo-esquema";
import { salvarReferencias, termosDaOP } from "@/lib/referencias-op";
import { rotuloDoPapel } from "@/lib/referencias-cliente";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const itemSchema = z.object({
  categoria: z.string().min(1),
  tipo: z.enum(["VERBA", "ESTRUTURA", "AREA", "ALUGUEL", "GENERICO"]),
  descricao: z.string().min(1),
  codigoOmie: z.string().optional().nullable(),
  localEstoque: z.string().optional().nullable(),
  unidade: z.string().optional().nullable(),
  qtdContratada: z.number().optional().nullable(),
  cmcMedio: z.number().optional().nullable(),
  meses: z.number().optional().nullable(),
  valorPorMes: z.number().optional().nullable(),
  capacidade: z.string().optional().nullable(),
  valorVerba: z.number().min(0),
  faturamentoDireto: z.boolean().default(false),
  observacao: z.string().optional().nullable(),
});

const schema = z.object({
  ...cabecalhoAditivo,
  itens: z.array(itemSchema).min(1),
});

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMERCIAL"]);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: e?.issues?.[0]?.message || "Dados inválidos" }, { status: 400 });
  }

  const ultimo = await prisma.aditivo.findFirst({
    where: { opId: params.id },
    orderBy: { numero: "desc" },
  });
  const numero = (ultimo?.numero || 0) + 1;

  // as referências do pedido do cliente (OC/AF/PC + itens + TAGs), com o rótulo do cliente fotografado
  let pedidoTexto = null;
  let termos = null;
  if (body.pedido?.codigo) {
    const op = await prisma.oP.findUnique({ where: { id: params.id }, select: { id: true, cliente: true, clienteId: true } });
    ({ termos } = await termosDaOP(op));
    pedidoTexto = `${rotuloDoPapel("PEDIDO", termos)} ${String(body.pedido.codigo).trim()}`;
  }

  // O aditivo também traz RECEITA nova (o que passa a ser faturado a mais) — as linhas entram na
  // OP, atrás das que já existem, marcadas com o aditivo. Os itens do aditivo continuam sendo a
  // VERBA DE COMPRA; são coisas diferentes e não podem se confundir (Vitor 19/08). A precedência
  // (digitado > planilha do estudo > valor único) mora em lib/receita-aditivo.
  const { linhas: linhasReceita, valor } = receitasDoAditivo({
    receitas: body.receitas || [], estudoDados: body.estudoDados, valor: body.valor, descricao: body.descricao, numero, pedidoTexto,
  });

  const ad = await prisma.aditivo.create({
    data: {
      opId: params.id,
      numero,
      status: "RASCUNHO",
      valor,
      descricao: body.descricao,
      dataInicio: body.dataInicio ? new Date(body.dataInicio) : null,
      dataFimPrevista: body.dataFimPrevista ? new Date(body.dataFimPrevista) : null,
      orcamentoPasta: body.orcamentoPasta || null,
      orcamentoRef: body.orcamentoRef || null,
      propostas: body.propostas || null,
      estudoArquivo: body.estudoArquivo || null,
      estudoDados: body.estudoDados || null,
      createdById: user.id,
      itens: {
        create: body.itens.map((it, idx) => ({
          ordem: idx,
          categoria: it.categoria,
          tipo: it.tipo,
          descricao: it.descricao,
          codigoOmie: it.codigoOmie || null,
          localEstoque: it.localEstoque || null,
          unidade: it.unidade || null,
          qtdContratada: it.qtdContratada ?? null,
          cmcMedio: it.cmcMedio ?? null,
          meses: it.meses ?? null,
          valorPorMes: it.valorPorMes ?? null,
          capacidade: it.capacidade || null,
          valorVerba: it.valorVerba,
          faturamentoDireto: it.faturamentoDireto,
          observacao: it.observacao || null,
        })),
      },
    },
  });

  if (body.pedido?.codigo) {
    await salvarReferencias({ opId: params.id, aditivoId: ad.id, entrada: { pedidos: [body.pedido] }, termos });
  }
  if (linhasReceita.length) {
    const ultimaOrdem = await prisma.oPReceita.aggregate({ where: { opId: params.id }, _max: { ordem: true } });
    const base = (ultimaOrdem._max.ordem ?? -1) + 1;
    await prisma.oPReceita.createMany({
      data: linhasReceita.map((r, i) => ({ ...r, opId: params.id, aditivoId: ad.id, ordem: base + i, createdById: user.id })),
    });
  }

  await prisma.auditLog.create({
    data: { userId: user.id, action: "create_aditivo", entity: "Aditivo", entityId: ad.id, diff: { numero, itens: body.itens.length, receitas: linhasReceita.length, receitasDigitadas: (body.receitas || []).length, valor, pedido: body.pedido?.codigo || null } },
  });

  return NextResponse.json({ id: ad.id, numero });
}
