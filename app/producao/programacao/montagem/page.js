import { requireRole } from "@/lib/session";
import SetorPlaceholder from "../SetorPlaceholder";
import { Wrench } from "lucide-react";

export const metadata = { title: "Workspace Torg — Programação · Montagem" };

export default async function ProgramacaoMontagem() {
  await requireRole(["ADMIN", "PRODUCAO"]);
  return <SetorPlaceholder setor="Montagem" icon={Wrench} />;
}
