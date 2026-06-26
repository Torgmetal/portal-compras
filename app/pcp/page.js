import { requireRole } from "@/lib/session";
import PCPDashboardClient from "./PCPDashboardClient";

export const metadata = {
  title: "Workspace Torg — PCP Dashboard",
};

export default async function PCPDashboard() {
  const user = await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]);
  return <PCPDashboardClient isAdmin={user.tipo === "ADMIN"} />;
}
