import { requireRole } from "@/lib/session";
import SetorPageClient from "@/components/pcp/SetorPageClient";

export const metadata = { title: "Workspace Torg — PCP Pintura" };

export default async function PinturaPage() {
  await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]);
  return <SetorPageClient setor="Pintura" titulo="Pintura" iconName="Paintbrush" corHex="#15803d" />;
}
