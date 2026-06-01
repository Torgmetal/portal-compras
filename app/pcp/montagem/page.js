import { requireRole } from "@/lib/session";
import { Wrench } from "lucide-react";
import SetorPageClient from "@/components/pcp/SetorPageClient";

export const metadata = { title: "Workspace Torg — PCP Montagem" };

export default async function MontagemPage() {
  await requireRole(["ADMIN", "PLANEJAMENTO", "PRODUCAO"]);
  return <SetorPageClient setor="Montagem" titulo="Montagem" icon={Wrench} corHex="#1d4ed8" />;
}
