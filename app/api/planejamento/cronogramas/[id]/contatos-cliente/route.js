// PATCH /api/planejamento/cronogramas/[id]/contatos-cliente
// Atualiza a lista de contatos do CLIENTE registrada na OP do cronograma —
// corrigir um e-mail digitado errado, ajustar o nome ou remover um contato.
// Recebe a lista completa desejada e a grava em OP.clienteContatos.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

export const runtime = "nodejs";
const normEmail = (e) => String(e || "").trim().toLowerCase();

const schema = z.object({
  contatos: z.array(z.object({
    nome: z.string().max(200).optional().nullable(),
    email: z.string().email("E-mail inválido"),
  })),
});

export async function PATCH(req, { params }) {
  try { await requireRole(["ADMIN", "PLANEJAMENTO", "COMERCIAL"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const c = await prisma.cronograma.findUnique({
    where: { id: params.id },
    select: { op: { select: { id: true } } },
  });
  if (!c) return NextResponse.json({ error: "Cronograma não encontrado" }, { status: 404 });
  if (!c.op?.id) return NextResponse.json({ error: "Cronograma sem OP — não há contatos do cliente para editar." }, { status: 400 });

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  // dedupe por e-mail normalizado, preservando a ordem
  const porEmail = new Map();
  for (const ct of body.contatos) {
    const em = normEmail(ct.email);
    if (em) porEmail.set(em, { nome: (ct.nome || "").trim(), email: em });
  }
  const contatos = [...porEmail.values()];

  await prisma.oP.update({ where: { id: c.op.id }, data: { clienteContatos: contatos } });
  return NextResponse.json({ success: true, contatos });
}
