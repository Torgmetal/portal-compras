import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { minutosDeBloqueio, registrarFalha } from "@/lib/login-tentativas";

// API publica (sem login). Valida email + senha atual e atualiza pra nova.
const schema = z.object({
  email: z.string().email("Email invalido"),
  senhaAtual: z.string().min(1, "Informe a senha atual"),
  novaSenha: z.string().min(8, "A nova senha deve ter no minimo 8 caracteres"),
  confirmar: z.string().min(1, "Confirme a nova senha"),
});

export async function POST(req) {
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
    return NextResponse.json({ error: "A confirmacao nao bate com a nova senha." }, { status: 400 });
  }
  if (body.senhaAtual === body.novaSenha) {
    return NextResponse.json({ error: "A nova senha precisa ser diferente da atual." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase().trim() } });
  if (!user || !user.ativo) {
    // Nao revela se o email existe ou nao — mensagem generica por seguranca
    return NextResponse.json({ error: "Email ou senha atual incorretos." }, { status: 400 });
  }

  // ⚠⚠ ESTA ROTA É PÚBLICA — e por isso é o SEGUNDO caminho de força bruta do portal, junto com o
  // login. Pior: quando acerta, ela TROCA a senha em vez de só abrir sessão. A trava é a mesma do
  // login, por conta (a fábrica inteira sai por um IP só), e vem antes do bcrypt.
  if (minutosDeBloqueio(user) > 0) {
    return NextResponse.json({ error: "Muitas tentativas. Tente de novo em alguns minutos." }, { status: 429 });
  }

  const ok = await bcrypt.compare(body.senhaAtual, user.password);
  if (!ok) {
    await registrarFalha(user.id);
    return NextResponse.json({ error: "Email ou senha atual incorretos." }, { status: 400 });
  }

  const hash = await bcrypt.hash(body.novaSenha, 10);
  await prisma.user.update({
    where: { id: user.id },
    // ⚠ LIMPAR OS DOIS CAMPOS. Só /api/meu-rh/trocar-senha fazia isso: quem trocava a senha por
    // aqui continuava com `deveTrocarSenha` ligado e `senhaAlteradaEm` vazio, então o portal
    // pedia a troca de novo e o campo que diz "esta conta já trocou de senha" mentia.
    data: { password: hash, deveTrocarSenha: false, senhaAlteradaEm: new Date(), tentativasFalhas: 0, bloqueadoAte: null },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "change_password_public",
      entity: "User",
      entityId: user.id,
      diff: {},
    },
  });

  return NextResponse.json({ ok: true });
}
