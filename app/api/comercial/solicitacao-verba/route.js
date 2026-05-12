import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const schema = z.object({
  tipoItem: z.enum(["op", "aditivo"]),
  itemId: z.string(),
  valorAtual: z.number().min(0),
  valorProposto: z.number().min(0),
  justificativa: z.string().min(1),
});

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMERCIAL"]);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = schema.parse(await req.json());

  // Garante que não existe outra solicitação pendente pra esse item
  const pendente = await prisma.solicitacaoVerba.findFirst({
    where: {
      status: "PENDENTE",
      ...(body.tipoItem === "op"
        ? { opItemId: body.itemId }
        : { aditivoItemId: body.itemId }),
    },
  });
  if (pendente) {
    return NextResponse.json(
      { error: "Já existe uma solicitação pendente pra esse item." },
      { status: 409 }
    );
  }

  // ADMIN sempre aplica direto. COMERCIAL com flag 'podeAlterarVerba' tambem
  // aplica direto (sem fluxo de solicitacao). COMERCIAL sem a flag cria
  // solicitacao PENDENTE que precisa de aprovacao do master.
  const podeAplicarDireto = user.role === "ADMIN" || user.podeAlterarVerba === true;

  const sol = await prisma.solicitacaoVerba.create({
    data: {
      opItemId: body.tipoItem === "op" ? body.itemId : null,
      aditivoItemId: body.tipoItem === "aditivo" ? body.itemId : null,
      valorAtual: body.valorAtual,
      valorProposto: body.valorProposto,
      justificativa: body.justificativa,
      createdById: user.id,
      ...(podeAplicarDireto
        ? {
            status: "APROVADA",
            decididoEm: new Date(),
            decididoById: user.id,
            observacaoMaster: user.role === "ADMIN"
              ? "Auto-aprovada pelo master."
              : `Auto-aprovada (permissao direta de alteracao de verba — ${user.email}).`,
          }
        : {}),
    },
  });

  // Se ja aprovada, aplica direto
  if (podeAplicarDireto) {
    if (body.tipoItem === "op") {
      await prisma.oPItem.update({ where: { id: body.itemId }, data: { valorVerba: body.valorProposto } });
    } else {
      await prisma.aditivoItem.update({ where: { id: body.itemId }, data: { valorVerba: body.valorProposto } });
    }
  }

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: podeAplicarDireto ? "alterar_verba" : "solicitar_verba",
      entity: body.tipoItem === "op" ? "OPItem" : "AditivoItem",
      entityId: body.itemId,
      diff: {
        de: body.valorAtual,
        para: body.valorProposto,
        diff: body.valorProposto - body.valorAtual,
        justificativa: body.justificativa,
      },
    },
  });

  return NextResponse.json({ id: sol.id, status: sol.status });
}
