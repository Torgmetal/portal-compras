// Vínculo de um usuário do portal ao registro de RH do funcionário — é o que faz o login por CPF
// funcionar (lib/auth.js resolve CPF → Funcionario → usuário). Vitor (14/09/2026): "criar um usuário
// para um funcionário, mas sem e-mail" — com o vínculo, o e-mail passa a ser opcional: a conta nasce
// com um e-mail interno `cpf@funcionario.torg` (não existe caixa postal; é só a chave única).
import { prisma } from "@/lib/prisma";

export const DOMINIO_SEM_EMAIL = "funcionario.torg";
export const formatarCpf = (d) => String(d || "").replace(/\D/g, "").replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");

/**
 * Confere o funcionário e devolve o que a conta precisa: e-mail interno (se não houver) e CPF formatado.
 * @param {string} funcionarioId
 * @param {string|null} usuarioAtualId  usuário sendo editado (para permitir manter o próprio vínculo)
 * @returns {Promise<{ok:true, funcionario:object, emailInterno:string, loginCpf:string} | {ok:false, erro:string}>}
 */
export async function validarVinculoFuncionario(funcionarioId, usuarioAtualId = null) {
  const f = await prisma.funcionario.findUnique({ where: { id: funcionarioId }, select: { id: true, nome: true, cpf: true, ativo: true, usuario: { select: { id: true, email: true } } } });
  if (!f) return { ok: false, erro: "Funcionário não encontrado no RH." };
  const cpf = String(f.cpf || "").replace(/\D/g, "");
  if (cpf.length !== 11) return { ok: false, erro: "O funcionário não tem CPF válido no cadastro do RH — complete lá antes de vincular." };
  if (f.usuario && f.usuario.id !== usuarioAtualId) return { ok: false, erro: `Este funcionário já está vinculado ao usuário ${f.usuario.email}.` };
  return { ok: true, funcionario: f, emailInterno: `${cpf}@${DOMINIO_SEM_EMAIL}`, loginCpf: formatarCpf(cpf) };
}

/** Como a pessoa entra: CPF quando há vínculo; senão o e-mail. Para mostrar na tela e na senha provisória. */
export function loginDe(usuario) {
  const cpf = String(usuario?.funcionario?.cpf || "").replace(/\D/g, "");
  if (cpf.length === 11) return { por: "cpf", login: formatarCpf(cpf), semEmail: String(usuario.email || "").endsWith(`@${DOMINIO_SEM_EMAIL}`) };
  return { por: "email", login: usuario?.email || "", semEmail: false };
}
