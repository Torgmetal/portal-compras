import { requireUser } from "@/lib/session";
import { redirect } from "next/navigation";
import FaturamentoClienteClient from "./FaturamentoClienteClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pedidos e faturamento · Torg Metal" };

// A aba financeira do cliente logado. Só entra quem tem login (cliente ou alguém da Torg vendo
// "como" um contato); a permissão por pessoa/obra é conferida na API, não aqui.
export default async function FaturamentoClientePage({ searchParams }) {
  const user = await requireUser();
  if (user.tipo !== "CLIENTE" && user.tipo !== "ADMIN") redirect("/");
  return <FaturamentoClienteClient como={typeof searchParams?.como === "string" ? searchParams.como : ""} />;
}
