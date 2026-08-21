// Fase 1 do agente de e-mails: tela interna pra VALIDAR a leitura das 6 caixas da
// Engenharia (MS Graph). Mostra o que foi ingerido "cru" (sem casar com OP ainda).
import { requireUser } from "@/lib/session";
import EmailsEngenhariaClient from "./EmailsEngenhariaClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "E-mails da Engenharia" };

export default async function EmailsEngenhariaPage() {
  await requireUser();
  return <EmailsEngenhariaClient />;
}
