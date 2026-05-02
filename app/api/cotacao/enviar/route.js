import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const fornecedorSchema = z.object({
  nome: z.string().min(1),
  email: z.string().email(),
  cnpj: z.string().optional().nullable(),
  nCodOmie: z.string().optional().nullable(),
});

const schema = z.object({
  rmId: z.string().min(1),
  itensIds: z.array(z.string()).min(1),
  fornecedores: z.array(fornecedorSchema).min(1),
  prazoResposta: z.string().optional().nullable(), // ISO date
  observacaoExtra: z.string().optional().nullable(),
});

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Apenas Admin ou Compras pode enviar cotação." }, { status: 403 });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados inválidos: " + e.message }, { status: 400 });
  }

  // Verifica RM e itens
  const rm = await prisma.rM.findUnique({
    where: { id: body.rmId },
    include: { itens: true },
  });
  if (!rm) return NextResponse.json({ error: "RM não encontrada." }, { status: 404 });

  const itensValidos = rm.itens.filter((it) => body.itensIds.includes(it.id));
  if (itensValidos.length === 0) {
    return NextResponse.json({ error: "Nenhum item válido pra cotar." }, { status: 400 });
  }

  // Filtra apenas itens em status que permitem cotação
  const itensCotaveis = itensValidos.filter((it) => it.status === "PENDENTE" || it.status === "EM_COTACAO");
  if (itensCotaveis.length === 0) {
    return NextResponse.json({ error: "Itens selecionados já estão fora de cotação." }, { status: 409 });
  }

  const prazo = body.prazoResposta ? new Date(body.prazoResposta) : null;

  // Cria 1 cotação por fornecedor com token único
  const cotacoesCriadas = [];
  await prisma.$transaction(async (tx) => {
    for (const f of body.fornecedores) {
      const token = randomUUID();
      const cot = await tx.cotacao.create({
        data: {
          rmId: rm.id,
          fornecedorNome: f.nome,
          fornecedorEmail: f.email,
          cnpj: f.cnpj || null,
          nCodOmie: f.nCodOmie || null,
          prazoResposta: prazo,
          observacao: body.observacaoExtra || null,
          token,
          status: "PENDENTE",
          itens: {
            create: itensCotaveis.map((it) => ({
              rmItemId: it.id,
              precoUnit: 0,
              qtdCotada: it.qtd,
            })),
          },
        },
      });
      // Registra envio
      await tx.envio.create({
        data: {
          rmId: rm.id,
          fornecedorNome: f.nome,
          fornecedorEmail: f.email,
        },
      });
      cotacoesCriadas.push({
        id: cot.id,
        token: cot.token,
        fornecedorNome: f.nome,
        fornecedorEmail: f.email,
      });
    }

    // Marca itens como EM_COTACAO
    await tx.rMItem.updateMany({
      where: { id: { in: itensCotaveis.map((i) => i.id) } },
      data: { status: "EM_COTACAO" },
    });

    // Atualiza status da RM
    if (rm.status === "ABERTA") {
      await tx.rM.update({ where: { id: rm.id }, data: { status: "EM_COTACAO" } });
    }

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "enviar_cotacao",
        entity: "RM",
        entityId: rm.id,
        diff: {
          fornecedores: body.fornecedores.length,
          itens: itensCotaveis.length,
          prazo: body.prazoResposta || null,
        },
      },
    });
  });

  return NextResponse.json({ ok: true, cotacoes: cotacoesCriadas });
}
