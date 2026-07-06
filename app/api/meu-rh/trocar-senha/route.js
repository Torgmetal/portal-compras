// POST /api/meu-rh/trocar-senha
// Troca de senha do funcionário logado (autoatendimento). Usado tanto na troca
// obrigatória (1º acesso / expiração 90d) quanto na troca voluntária. Valida a
// senha atual, grava a nova, limpa deveTrocarSenha e marca senhaAlteradaEm.
import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireFuncionario } from "@/lib/session";

export const runtime = "nodejs";

const schema = z.object({
  senhaAtual: z.string().min(1, "Informe a senha atual"),
  novaSenha: z.string().min(8, "A nova senha deve ter no mínimo 8 caracteres"),
  confirmar: z.string().min(1, "Confirme a nova senha"),
});

export async function POST(req) {
  let sessao;
  try {
    sessao = await requireFuncionario();
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Body inválido" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });

  if (parsed.data.novaSenha !== parsed.data.confirmar) {
    return NextResponse.json({ error: "A confirmação não bate com a nova senha." }, { status: 400 });
  }
  if (parsed.data.senhaAtual === parsed.data.novaSenha) {
    return NextResponse.json({ error: "A nova senha precisa ser diferente da atual." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: sessao.id }, select: { id: true, password: true, ativo: true } });
  if (!user || !user.ativo) return NextResponse.json({ error: "Usuário inválido." }, { status: 400 });

  const ok = await bcrypt.compare(parsed.data.senhaAtual, user.password);
  if (!ok) return NextResponse.json({ error: "Senha atual incorreta." }, { status: 400 });

  const hash = await bcrypt.hash(parsed.data.novaSenha, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hash, deveTrocarSenha: false, senhaAlteradaEm: new Date() },
  });

  await prisma.auditLog.create({
    data: { userId: user.id, action: "TROCAR_SENHA_FUNCIONARIO", entity: "User", entityId: user.id, diff: {} },
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
