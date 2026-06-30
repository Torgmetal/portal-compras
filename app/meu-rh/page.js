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
  return <MeuRHClient nome={session.user.name || "Funcionário"} />;
}
