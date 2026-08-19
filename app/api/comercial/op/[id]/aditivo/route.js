import { NextResponse } from "next/server";
import { z } from "zod";
import { receitasDaPlanilhaComercial } from "@/lib/op-categorias";
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

  const ad = await prisma.aditivo.create({
    data: {
      opId: params.id,
      numero,
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

  // O aditivo também traz RECEITA nova (o que passa a ser faturado a mais) — as linhas de venda
  // do estudo do aditivo entram na OP, atrás das que já existem. Os itens do aditivo continuam
  // sendo a VERBA DE COMPRA; são coisas diferentes e não podem se confundir (Vitor 19/08).
  const receitasNovas = receitasDaPlanilhaComercial(body.estudoDados?.comercial, body.estudoDados?.bdi);
  if (receitasNovas.length) {
    const ultimaOrdem = await prisma.oPReceita.aggregate({ where: { opId: params.id }, _max: { ordem: true } });
    const base = (ultimaOrdem._max.ordem ?? -1) + 1;
    await prisma.oPReceita.createMany({
      data: receitasNovas.map((r, i) => ({
        ...r, opId: params.id, ordem: base + i, createdById: user.id,
        observacao: `${r.observacao} · aditivo ${numero}`,
      })),
    });
  }

  await prisma.auditLog.create({
    data: { userId: user.id, action: "create_aditivo", entity: "Aditivo", entityId: ad.id, diff: { numero, itens: body.itens.length, receitas: receitasNovas.length } },
  });

  return NextResponse.json({ id: ad.id, numero });
}
