import { requireRole } from "@/lib/session";
import PCPDashboardClient from "./PCPDashboardClient";

export const metadata = {
  title: "Workspace Torg — PCP Dashboard",
};

export default async function PCPDashboard() {
  await requireRole(["ADMIN", "PLANEJAMENTO", "PRODUCAO"]);
  return <PCPDashboardClient />;
}
