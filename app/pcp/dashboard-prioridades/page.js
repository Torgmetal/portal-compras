import { requireRole } from "@/lib/session";
import DashboardPrioridadesClient from "./DashboardPrioridadesClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "PCP — Prioridades (TV)" };

export default async function DashboardPrioridadesPage() {
  await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]);
  return <DashboardPrioridadesClient />;
}
