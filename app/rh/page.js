import { requireRole } from "@/lib/session";
import RHDashboardClient from "./RHDashboardClient";

export const dynamic = "force-dynamic";

export default async function RHPage() {
  await requireRole(["ADMIN", "RH"]);
  return <RHDashboardClient />;
}
