import { requireRole } from "@/lib/session";
import { DashboardClient } from "./IndicadoresClient";

export default async function IndicadoresPage() {
  await requireRole(["ADMIN", "COMPRAS"]);
  return <DashboardClient />;
}
