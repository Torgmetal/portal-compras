import { requireRole } from "@/lib/session";
import SetorPlaceholder from "../SetorPlaceholder";
import { Truck } from "lucide-react";

export const metadata = { title: "Workspace Torg — Programação · Expedição" };

export default async function ProgramacaoExpedicao() {
  await requireRole(["ADMIN", "PRODUCAO"]);
  return <SetorPlaceholder setor="Expedição" icon={Truck} />;
}
