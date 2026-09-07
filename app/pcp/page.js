import { requireRole } from "@/lib/session";
import PCPPainelClient from "./PCPPainelClient";

export const metadata = {
  title: "Workspace Torg — PCP Dashboard",
};

export default async function PCPDashboard() {
  const user = await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]);
  return <PCPPainelClient isAdmin={user.tipo === "ADMIN"} />;
}
