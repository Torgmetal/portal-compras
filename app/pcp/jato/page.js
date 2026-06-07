import { requireRole } from "@/lib/session";
import SetorPageClient from "@/components/pcp/SetorPageClient";

export const metadata = { title: "Workspace Torg — PCP Jato" };

export default async function JatoPage() {
  await requireRole(["ADMIN", "PLANEJAMENTO", "PRODUCAO"]);
  return <SetorPageClient setor="Jato" titulo="Jato" iconName="Wind" corHex="#0e7490" />;
}
