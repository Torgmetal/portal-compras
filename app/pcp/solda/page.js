import { requireRole } from "@/lib/session";
import SetorPageClient from "@/components/pcp/SetorPageClient";

export const metadata = { title: "Workspace Torg — PCP Solda" };

export default async function SoldaPage() {
  await requireRole(["ADMIN", "PLANEJAMENTO", "PRODUCAO"]);
  return <SetorPageClient setor="Solda" titulo="Solda" iconName="Flame" corHex="#c2410c" />;
}
