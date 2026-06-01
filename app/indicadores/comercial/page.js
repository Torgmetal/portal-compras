import { requireRole } from "@/lib/session";
import { ComercialDashboardClient } from "../IndicadoresComercialClient";

export default async function ComercialDashboardPage() {
  await requireRole(["ADMIN", "COMERCIAL"]);
  return <ComercialDashboardClient />;
}
