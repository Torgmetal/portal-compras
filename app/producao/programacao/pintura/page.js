import { requireRole } from "@/lib/session";
import SetorPlaceholder from "../SetorPlaceholder";
import { Paintbrush } from "lucide-react";

export const metadata = { title: "Workspace Torg — Programação · Pintura" };

export default async function ProgramacaoPintura() {
  await requireRole(["ADMIN", "PRODUCAO"]);
  return <SetorPlaceholder setor="Pintura" icon={Paintbrush} />;
}
