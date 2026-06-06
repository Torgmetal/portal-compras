import { requireRole } from "@/lib/session";
import SetorPlaceholder from "../SetorPlaceholder";
import { Wind } from "lucide-react";

export const metadata = { title: "Workspace Torg — Programação · Jato" };

export default async function ProgramacaoJato() {
  await requireRole(["ADMIN", "PRODUCAO"]);
  return <SetorPlaceholder setor="Jato" icon={Wind} />;
}
