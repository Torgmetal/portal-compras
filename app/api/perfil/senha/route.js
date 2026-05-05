import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

const schema = z.object({
  senhaAtual: z.string().min(1, "Informe a senha atual"),
  novaSenha: z.string().min(8, "A nova senha deve ter no minimo 8 caracteres"),
  confirmar: z.string().min(1, "Confirme a nova senha"),
});

export async function POST(req) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: e.errors?.[0]?.message || "Dados invalidos" },
      { status: 400 }
    );
  }

  if (body.novaSenha !== body.confirmar) {
    return NextResponse.json(
      { error: "A confirmacao nao bate com a nova senha." },
      { status: 400 }
    );
  }

  if (body.senhaAtual === body.novaSenha) {
    return NextResponse.json(
      { error: "A nova senha precisa ser diferente da atual." },
      { status: 400 }
    );
  }

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser) {
    return NextResponse.json({ error: "Usuario nao encontrado." }, { status: 404 });
  }

  const ok = await bcrypt.compare(body.senhaAtual, dbUser.password);
  if (!ok) {
    return NextResponse.json({ error: "Senha atual incorreta." }, { status: 400 });
  }

  const hash = await bcrypt.hash(body.novaSenha, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hash },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "change_password",
      entity: "User",
      entityId: user.id,
      diff: {},
    },
  });

  return NextResponse.json({ ok: true });
}
