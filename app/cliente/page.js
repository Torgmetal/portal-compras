import { requireUser } from "@/lib/session";
import { redirect } from "next/navigation";
import MeuEspacoClient from "./MeuEspacoClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meus documentos · Torg Metal" };

/**
 * A PORTA DE ENTRADA DO CLIENTE LOGADO.
 *
 * ⚠⚠ Sem ela, o cliente que fazia login caía na home do ERP e era mandado para "sem acesso" —
 * logo depois de o portal ter pedido que ele entrasse. O acesso de cliente existe para assinar
 * documento; aqui ele vê o que está esperando por ele e as obras cujo portal recebeu.
 */
export default async function EspacoClientePage() {
  const user = await requireUser();
  // usuário interno não usa esta área — ele tem o portal inteiro
  if (user.tipo !== "CLIENTE" && user.tipo !== "ADMIN") redirect("/");
  return <MeuEspacoClient />;
}
