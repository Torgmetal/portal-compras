import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export async function PATCH(req, { params }) {
  let user;
  try {
    user = await requireRole([
      "ADMIN", "PLANEJAMENTO", "PRODUCAO", "COMERCIAL",
      "ENGENHARIA", "COMPRAS", "ALMOXARIFADO", "FINANCEIRO", "EXPEDICAO", "RH",
    ]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ error: e.message }, { status });
  }

  const compromisso = await prisma.compromisso.findUnique({
    where: { id: params.id },
  });

  if (!compromisso) {
    return NextResponse.json({ error: "Compromisso não encontrado" }, { status: 404 });
  }

  // Só o próprio dono ou admin pode alterar
  if (compromisso.userId !== user.id && user.tipo !== "ADMIN") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const data = {};
  if (typeof body.concluido === "boolean") {
    data.concluido = body.concluido;
    data.concluidoEm = body.concluido ? new Date() : null;
  }

  const atualizado = await prisma.compromisso.update({
    where: { id: params.id },
    data,
  });

  return NextResponse.json({ compromisso: atualizado });
}
