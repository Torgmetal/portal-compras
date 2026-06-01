import { requireRole } from "@/lib/session";
import { Flame } from "lucide-react";
import SetorPageClient from "@/components/pcp/SetorPageClient";

export const metadata = { title: "Workspace Torg — PCP Solda" };

export default async function SoldaPage() {
  await requireRole(["ADMIN", "PLANEJAMENTO", "PRODUCAO"]);
  return <SetorPageClient setor="Solda" titulo="Solda" icon={Flame} corHex="#c2410c" />;
}
