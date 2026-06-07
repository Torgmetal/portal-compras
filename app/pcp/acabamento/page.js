import { requireRole } from "@/lib/session";
import SetorPageClient from "@/components/pcp/SetorPageClient";

export const metadata = { title: "Workspace Torg — PCP Acabamento" };

export default async function AcabamentoPage() {
  await requireRole(["ADMIN", "PLANEJAMENTO", "PRODUCAO"]);
  return <SetorPageClient setor="Acabamento" titulo="Acabamento" iconName="Sparkles" corHex="#7e22ce" />;
}
