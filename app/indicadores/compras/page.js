import { requireRole } from "@/lib/session";
import { DashboardClient } from "../IndicadoresClient";

export default async function ComprasDashboardPage() {
  await requireRole(["ADMIN", "COMPRAS"]);
  return <DashboardClient />;
}
