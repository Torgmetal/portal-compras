// POST /api/rh/funcionarios/[id]/acesso
// Habilita (ou reseta a senha de) o acesso de autoatendimento do funcionário:
// cria/vincula um User tipo=FUNCIONARIO ao registro de RH, com senha temporária.
// O LOGIN é feito pelo CPF do funcionário (não e-mail). A senha em plaintext só
// aparece neste response (nunca persiste em claro). O funcionário é obrigado a
// trocar a senha no 1º acesso (deveTrocarSenha=true). Só ADMIN/RH.
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { gerarSenhaTemporaria } from "@/lib/gerar-senha";

export const runtime = "nodejs";

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "RH"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const func = await prisma.funcionario.findUnique({
    where: { id: params.id },
    select: { id: true, nome: true, cpf: true, email: true, ativo: true, usuario: { select: { id: true } } },
  });
  if (!func) return NextResponse.json({ success: false, error: "Funcionário não encontrado" }, { status: 404 });

  const cpfDigitos = String(func.cpf || "").replace(/\D/g, "");
  if (cpfDigitos.length !== 11) {
    return NextResponse.json({ success: false, error: "Funcionário sem CPF válido cadastrado — preencha o CPF antes de habilitar o acesso (o login é feito pelo CPF)." }, { status: 400 });
  }

  const senha = gerarSenhaTemporaria();
  const hash = await bcrypt.hash(senha, 10);
  const cpfFmt = cpfDigitos.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");

  // Já tem acesso → reset de senha (força nova troca)
  if (func.usuario) {
    await prisma.user.update({
      where: { id: func.usuario.id },
      data: { password: hash, ativo: true, deveTrocarSenha: true, senhaAlteradaEm: null },
    });
    await prisma.auditLog.create({
      data: { userId: user.id, action: "RESET_SENHA_FUNCIONARIO", entity: "Funcionario", entityId: func.id, diff: { cpf: cpfFmt } },
    }).catch(() => {});
    return NextResponse.json({ success: true, modo: "reset", login: cpfFmt, senhaTemporaria: senha });
  }

  // O login é por CPF, mas o User precisa de um e-mail único (campo obrigatório).
  // Usa o e-mail real se houver; senão um sintético baseado no CPF (nunca usado
  // pra login). Não pode colidir com um usuário interno já existente.
  const emailBase = (func.email || "").toLowerCase().trim();
  const email = emailBase || `${cpfDigitos}@funcionario.torg`;
  const existente = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existente) {
    return NextResponse.json({ success: false, error: "Já existe um usuário com este e-mail no portal — remova o e-mail do funcionário (o login é por CPF) ou vincule manualmente." }, { status: 409 });
  }

  const novo = await prisma.user.create({
    data: { email, name: func.nome, password: hash, tipo: "FUNCIONARIO", funcionarioId: func.id, ativo: true, deveTrocarSenha: true, senhaAlteradaEm: null },
    select: { id: true },
  });
  await prisma.auditLog.create({
    data: { userId: user.id, action: "HABILITAR_ACESSO_FUNCIONARIO", entity: "Funcionario", entityId: func.id, diff: { cpf: cpfFmt, userId: novo.id } },
  }).catch(() => {});

  return NextResponse.json({ success: true, modo: "criado", login: cpfFmt, senhaTemporaria: senha });
}
