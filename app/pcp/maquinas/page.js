import { requireRole } from "@/lib/session";
import MaquinasClient from "./MaquinasClient";

export const metadata = { title: "Workspace Torg — PCP Máquinas" };

export default async function MaquinasPage() {
  await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]);
  return <MaquinasClient />;
}
