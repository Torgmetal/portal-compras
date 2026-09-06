import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { destinoLogin } from "@/lib/destino-login";

// Compatibilidade com links da seleção anterior: agora a entrada abre diretamente as OPs.
export default async function ModulosPage() {
  const session = await getSession();
  redirect(session?.user ? destinoLogin(session.user) : "/entrar");
}
