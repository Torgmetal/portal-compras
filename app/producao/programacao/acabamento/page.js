import { requireRole } from "@/lib/session";
import SetorPlaceholder from "../SetorPlaceholder";
import { Sparkles } from "lucide-react";

export const metadata = { title: "Workspace Torg — Programação · Acabamento" };

export default async function ProgramacaoAcabamento() {
  await requireRole(["ADMIN", "PRODUCAO"]);
  return <SetorPlaceholder setor="Acabamento" icon={Sparkles} />;
}
