import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { MODULO_CAMPO } from "@/lib/qualidade-campo";
import CampoClient from "./CampoClient";

export const dynamic = "force-dynamic";

export default async function CampoPage() {
  const session = await getSession();
  const u = session?.user;
  if (!u) redirect("/campo/entrar");

  const pode = u.tipo === "ADMIN" || (u.modulos || []).some((m) => [MODULO_CAMPO, "QUALIDADE"].includes(m));
  if (!pode) redirect("/campo/entrar?sem-acesso=1");

  return <CampoClient nome={u.name || "Inspetor"} />;
}
