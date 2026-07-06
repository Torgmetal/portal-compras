import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import TrocarSenhaFuncionarioClient from "./TrocarSenhaFuncionarioClient";

export const dynamic = "force-dynamic";

export default async function TrocarSenhaFuncionarioPage() {
  const session = await getSession();
  if (!session?.user || session.user.tipo !== "FUNCIONARIO" || !session.user.funcionarioId) {
    redirect("/entrar");
  }
  return (
    <TrocarSenhaFuncionarioClient
      nome={session.user.name || "Funcionário"}
      obrigatoria={!!session.user.deveTrocarSenha}
    />
  );
}
