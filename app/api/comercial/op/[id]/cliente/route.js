import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

// PATCH — atualiza dados fiscais/cadastrais do cliente da OP.
// Necessario quando ha itens em Faturamento Direto (FD).

const schema = z.object({
  clienteRazaoSocial: z.string().nullable().optional(),
  clienteCnpj: z.string().nullable().optional(),
  clienteIE: z.string().nullable().optional(),
  clienteEndereco: z.string().nullable().optional(),
  clienteCidade: z.string().nullable().optional(),
  clienteUF: z.string().nullable().optional(),
  clienteCep: z.string().nullable().optional(),
  clienteContato: z.string().nullable().optional(),
  clienteEmail: z.string().email().nullable().optional().or(z.literal("")),
  clienteTelefone: z.string().nullable().optional(),
});

export async function PATCH(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMERCIAL"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao." }, { status: 403 });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados invalidos" }, { status: 400 });
  }

  const op = await prisma.oP.findUnique({ where: { id: params.id } });
  if (!op) return NextResponse.json({ error: "OP nao encontrada" }, { status: 404 });

  // Limpa CNPJ — so digitos
  const dataUpdate = { ...body };
  if (dataUpdate.clienteCnpj !== undefined && dataUpdate.clienteCnpj !== null) {
    dataUpdate.clienteCnpj = dataUpdate.clienteCnpj.replace(/\D/g, "") || null;
  }
  if (dataUpdate.clienteEmail === "") dataUpdate.clienteEmail = null;

  await prisma.oP.update({ where: { id: op.id }, data: dataUpdate });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "edit_op_cliente_fiscal",
      entity: "OP",
      entityId: op.id,
      diff: {
        opNumero: op.numero,
        camposAtualizados: Object.keys(dataUpdate),
      },
    },
  });

  return NextResponse.json({ ok: true });
}
