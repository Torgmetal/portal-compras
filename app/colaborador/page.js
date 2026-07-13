import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import LoginColaborador from "./LoginColaborador";
import MeuRHClient from "@/app/meu-rh/MeuRHClient";

export const dynamic = "force-dynamic";

// /colaborador é o app do funcionário: login quando deslogado, portal quando
// logado (não usamos mais /meu-rh como URL — ele redireciona pra cá).
export default async function ColaboradorPage() {
  const session = await getSession();
  const u = session?.user;

  if (u && u.tipo === "FUNCIONARIO" && u.funcionarioId) {
    // Troca de senha obrigatória (1º acesso com senha provisória).
    if (u.deveTrocarSenha) redirect("/colaborador/trocar-senha");
    return <MeuRHClient nome={u.name || "Colaborador"} />;
  }

  // Deslogado (ou usuário interno) → tela de login do colaborador.
  return <LoginColaborador />;
}
