import { requireRole } from "@/lib/session";
import SetorPageClient from "@/components/pcp/SetorPageClient";

export const metadata = { title: "Workspace Torg — PCP Corte" };

export default async function CortePage() {
  await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]);
  return <SetorPageClient setor="Corte" titulo="Corte" iconName="Scissors" corHex="#b91c1c" />;
}
