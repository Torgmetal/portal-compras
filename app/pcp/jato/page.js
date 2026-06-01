import { requireRole } from "@/lib/session";
import { Wind } from "lucide-react";
import SetorPageClient from "@/components/pcp/SetorPageClient";

export const metadata = { title: "Workspace Torg — PCP Jato" };

export default async function JatoPage() {
  await requireRole(["ADMIN", "PLANEJAMENTO", "PRODUCAO"]);
  return <SetorPageClient setor="Jato" titulo="Jato" icon={Wind} corHex="#0e7490" />;
}
