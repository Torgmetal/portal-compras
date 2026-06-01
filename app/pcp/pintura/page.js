import { requireRole } from "@/lib/session";
import { Paintbrush } from "lucide-react";
import SetorPageClient from "@/components/pcp/SetorPageClient";

export const metadata = { title: "Workspace Torg — PCP Pintura" };

export default async function PinturaPage() {
  await requireRole(["ADMIN", "PLANEJAMENTO", "PRODUCAO"]);
  return <SetorPageClient setor="Pintura" titulo="Pintura" icon={Paintbrush} corHex="#15803d" />;
}
