// Indicadores → Engenharia → E-mails: feed das caixas da Engenharia (MS Graph).
// Conteúdo sensível (correspondência de projeto) → SÓ ADMIN ou DIRETORIA.
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { temAcessoDiretoria } from "@/lib/diretoria";
import EmailsEngenhariaClient from "./EmailsEngenhariaClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "E-mails da Engenharia — Indicadores" };

export default async function EmailsEngenhariaIndicadoresPage() {
  const user = await requireUser();
  const diretor = user.tipo === "ADMIN" || (await temAcessoDiretoria(user.email).catch(() => false));
  if (!diretor) redirect("/indicadores");
  return <EmailsEngenhariaClient />;
}
