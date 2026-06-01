import { requireRole } from "@/lib/session";
import { RHDashboardClient } from "../IndicadoresRHClient";

export default async function RHDashboardPage() {
  await requireRole(["ADMIN", "RH"]);
  return <RHDashboardClient />;
}
