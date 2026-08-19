import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { criarCronogramaPadrao } from "@/lib/cronograma-padrao";

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

const opSchema = z.object({
  numero: z.string().min(1).transform((s) => s.trim().toUpperCase()),
  cliente: z.string().min(1).transform((s) => s.trim()),
  obra: z.string().optional().nullable(),
  refCliente: z.string().optional().nullable(),
  descricao: z.string().optional().nullable(),
  dataInicio: z.string().optional().nullable(),
  dataFimPrevista: z.string().optional().nullable(),
  estoqueMaterial: z.enum(["PROPRIO_TORG", "CLIENTE_TERCEIRO"]).optional().nullable(),
  tipoDataBook: z.enum(["PADRAO_TORG", "SNQC", "RELATORIO_ACOMPANHAMENTO"]).optional().nullable(),
  // vínculo com o orçamento do Comercial (SharePoint) + o que foi lido da planilha de estudo
  orcamentoPasta: z.string().optional().nullable(),
  orcamentoRef: z.string().optional().nullable(),
  propostas: z.any().optional().nullable(),
  estudoArquivo: z.any().optional().nullable(),
  estudoDados: z.any().optional().nullable(),
  itens: z.array(itemSchema).min(1),
});

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMERCIAL"]);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = opSchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados inválidos: " + (e.message || "") }, { status: 400 });
  }

  const existe = await prisma.oP.findUnique({ where: { numero: body.numero } });
  if (existe) {
    return NextResponse.json(
      { error: `Já existe uma OP com o número ${body.numero}.` },
      { status: 409 }
    );
  }

  const op = await prisma.oP.create({
    data: {
      numero: body.numero,
      cliente: body.cliente,
      obra: body.obra || null,
      refCliente: body.refCliente || null,
      descricao: body.descricao || null,
      dataInicio: body.dataInicio ? new Date(body.dataInicio) : null,
      dataFimPrevista: body.dataFimPrevista ? new Date(body.dataFimPrevista) : null,
      estoqueMaterial: body.estoqueMaterial || null,
      tipoDataBook: body.tipoDataBook || null,
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

  // CRONOGRAMA AUTOMÁTICO — nasce junto da OP, com a data que o Comercial informou (Vitor 19/08:
  // "abriu a OP, abre cronograma automático… o ideal seria o cálculo exatamente de acordo com as
  // datas que vêm indicadas pelo comercial"). Nunca derruba a criação da OP.
  try {
    await criarCronogramaPadrao({
      opId: op.id, opNumero: op.numero, titulo: op.obra || `OP-${op.numero}`,
      dataInicio: op.dataInicio, dataFim: op.dataFimPrevista,
    });
  } catch {}

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "create_op",
      entity: "OP",
      entityId: op.id,
      diff: { numero: op.numero, cliente: op.cliente, itens: body.itens.length },
    },
  });

  revalidatePath("/comercial");
  return NextResponse.json({ id: op.id, numero: op.numero });
}
