import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

// POST — acrescenta N itens a um ADITIVO já criado.
//
// ⚠⚠ POR QUE FALTAVA. Vitor (05/09/2026), montando o Aditivo 1 da ETC-00846-26: "estou fazendo como
// aditivo, mas aí não tem botão para adicionar mais itens como tintas etc… o aditivo não permite
// acrescentar mais verbas em linhas para podermos deixar o contrato adequado no portal".
//
// O aditivo nascia fechado: os itens só entravam na criação. Na vida real ele é montado aos poucos
// — chega a matéria-prima, depois a tinta, depois o serviço de terceiro — e a alternativa era criar
// um Aditivo 2 só para caber uma linha, o que suja o contrato e o histórico. A OP base já tinha
// essa rota (op/[id]/itens); esta é a mesma coisa, um nível abaixo.
//
// A permissão é a mesma da OP base: quem é do COMERCIAL sem `podeAlterarVerba` não mexe em verba.
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

const schema = z.object({ itens: z.array(itemSchema).min(1) });

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMERCIAL"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao." }, { status: 403 });
  }
  if (user.modulos?.includes("COMERCIAL") && !user.podeAlterarVerba) {
    return NextResponse.json({ error: "Voce nao tem permissao pra acrescentar verba ao aditivo." }, { status: 403 });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados invalidos: " + (e.message || "") }, { status: 400 });
  }

  const aditivo = await prisma.aditivo.findUnique({
    where: { id: params.id },
    select: { id: true, numero: true, opId: true, op: { select: { numero: true } }, itens: { select: { ordem: true } } },
  });
  if (!aditivo) return NextResponse.json({ error: "Aditivo nao encontrado." }, { status: 404 });

  const maxOrdem = aditivo.itens.reduce((m, it) => Math.max(m, it.ordem), -1);

  const created = await prisma.aditivoItem.createMany({
    data: body.itens.map((it, idx) => ({
      aditivoId: aditivo.id,
      ordem: maxOrdem + 1 + idx,
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
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "add_aditivo_itens",
      entity: "Aditivo",
      entityId: aditivo.id,
      diff: {
        opNumero: aditivo.op?.numero || null,
        aditivo: aditivo.numero,
        qtdItensAdicionados: created.count,
        valorTotal: body.itens.reduce((s, it) => s + (it.valorVerba || 0), 0),
      },
    },
  }).catch(() => {});

  return NextResponse.json({ ok: true, count: created.count });
}
