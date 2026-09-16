import { NextResponse } from "next/server";
import { z } from "zod";
import { receitasDaPlanilhaComercial, categoriaDaReceita } from "@/lib/op-categorias";
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
  descricao: z.string().min(1),
  itens: z.array(itemSchema).min(1),
  // Aditivo tem prazo e orçamento PRÓPRIOS — Vitor (19/08): "quando criamos um aditivo precisa ser
  // divulgado a todos os setores as informações desse aditivo… importar proposta e planilha de
  // estudo… importante ter data de início e fim também".
  dataInicio: z.string().nullable().optional(),
  dataFimPrevista: z.string().nullable().optional(),
  orcamentoPasta: z.string().nullable().optional(),
  orcamentoRef: z.string().nullable().optional(),
  propostas: z.any().nullable().optional(),
  estudoArquivo: z.any().nullable().optional(),
  estudoDados: z.any().nullable().optional(),
  // ⚠⚠ ADITIVO É UM PEDIDO NOVO DO CLIENTE (Vitor, 16/09/2026): a OC/AF/PC dele, com itens e TAGs, nas
  // palavras do cliente (lib/referencias-cliente), e um valor contratado próprio.
  pedido: z.object({
    codigo: z.string().trim().max(120).optional().nullable(),
    descricao: z.string().trim().max(300).optional().nullable(),
    valor: z.union([z.number(), z.string()]).optional().nullable(),
    data: z.string().optional().nullable(),
    revisao: z.string().trim().max(40).optional().nullable(),
    itens: z.union([z.array(z.any()), z.string()]).optional().nullable(),
    tags: z.union([z.array(z.any()), z.string()]).optional().nullable(),
  }).optional().nullable(),
  valor: z.number().min(0).optional().nullable(),
});

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMERCIAL"]);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = schema.parse(await req.json());

  const ultimo = await prisma.aditivo.findFirst({
    where: { opId: params.id },
    orderBy: { numero: "desc" },
  });
  const numero = (ultimo?.numero || 0) + 1;
  const receitasNovas = receitasDaPlanilhaComercial(body.estudoDados?.comercial, body.estudoDados?.bdi);
  const valorReceitas = receitasNovas.reduce((s, r) => s + (Number(r.valor) || 0), 0);
  const valor = body.valor != null ? Number(body.valor) : (valorReceitas || null);

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

  // as referências do pedido do cliente (OC/AF/PC + itens + TAGs), com o rótulo do cliente fotografado
  let pedidoTexto = null;
  if (body.pedido?.codigo) {
    const op = await prisma.oP.findUnique({ where: { id: params.id }, select: { id: true, cliente: true, clienteId: true } });
    const { termos } = await termosDaOP(op);
    await salvarReferencias({ opId: params.id, aditivoId: ad.id, entrada: { pedidos: [body.pedido] }, termos });
    pedidoTexto = `${rotuloDoPapel("PEDIDO", termos)} ${String(body.pedido.codigo).trim()}`;
  }
  // O aditivo também traz RECEITA nova (o que passa a ser faturado a mais) — as linhas de venda
  // do estudo do aditivo entram na OP, atrás das que já existem, marcadas com o aditivo. Os itens do
  // aditivo continuam sendo a VERBA DE COMPRA; são coisas diferentes e não podem se confundir
  // (Vitor 19/08). Sem estudo mas com valor, nasce UMA linha de receita com o valor do aditivo —
  // "linha de medição nova, como se fosse uma nova OP" (Vitor, 16/09/2026).
  const linhasReceita = receitasNovas.length
    ? receitasNovas.map((r) => ({ ...r, observacao: `${r.observacao} · aditivo ${numero}` }))
    : (valor > 0 ? [{ categoria: categoriaDaReceita(body.descricao), descricao: `Aditivo ${numero}${pedidoTexto ? ` — ${pedidoTexto}` : ""}`.slice(0, 200), tipoPreco: "VALOR", unidade: null, quantidade: null, valorUnitario: null, valor, observacao: `aditivo ${numero}` }] : []);
  if (linhasReceita.length) {
    const ultimaOrdem = await prisma.oPReceita.aggregate({ where: { opId: params.id }, _max: { ordem: true } });
    const base = (ultimaOrdem._max.ordem ?? -1) + 1;
    await prisma.oPReceita.createMany({
      data: linhasReceita.map((r, i) => ({ ...r, opId: params.id, aditivoId: ad.id, ordem: base + i, createdById: user.id })),
    });
  }

  await prisma.auditLog.create({
    data: { userId: user.id, action: "create_aditivo", entity: "Aditivo", entityId: ad.id, diff: { numero, itens: body.itens.length, receitas: linhasReceita.length, valor, pedido: body.pedido?.codigo || null } },
  });

  return NextResponse.json({ id: ad.id, numero });
}
