import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { destinoLogin } from "@/lib/destino-login";

export default async function Home() {
  const session = await getSession();
  redirect(session?.user ? destinoLogin(session.user) : "/entrar");
}
