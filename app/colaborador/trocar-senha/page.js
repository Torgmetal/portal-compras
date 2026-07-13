import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import TrocarSenhaFuncionarioClient from "@/app/meu-rh/trocar-senha/TrocarSenhaFuncionarioClient";

export const dynamic = "force-dynamic";

export default async function TrocarSenhaColaboradorPage() {
  const session = await getSession();
  if (!session?.user || session.user.tipo !== "FUNCIONARIO" || !session.user.funcionarioId) {
    redirect("/colaborador");
  }
  return (
    <TrocarSenhaFuncionarioClient
      nome={session.user.name || "Colaborador"}
      obrigatoria={!!session.user.deveTrocarSenha}
    />
  );
}
