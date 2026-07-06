import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import MeuRHClient from "./MeuRHClient";

export const dynamic = "force-dynamic";

export default async function MeuRHPage() {
  const session = await getSession();
  // Área exclusiva do funcionário (autoatendimento). O middleware já barra os
  // demais, mas reforçamos aqui (defesa em profundidade).
  if (!session?.user || session.user.tipo !== "FUNCIONARIO" || !session.user.funcionarioId) {
    redirect("/entrar");
  }
  // Troca de senha obrigatória (1º acesso com senha provisória / expiração 90d).
  if (session.user.deveTrocarSenha) {
    redirect("/meu-rh/trocar-senha");
  }
  return <MeuRHClient nome={session.user.name || "Funcionário"} />;
}
