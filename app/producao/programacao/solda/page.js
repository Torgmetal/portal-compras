import { requireRole } from "@/lib/session";
import SetorPlaceholder from "../SetorPlaceholder";
import { Flame } from "lucide-react";

export const metadata = { title: "Workspace Torg — Programação · Solda" };

export default async function ProgramacaoSolda() {
  await requireRole(["ADMIN", "PRODUCAO"]);
  return <SetorPlaceholder setor="Solda" icon={Flame} />;
}
