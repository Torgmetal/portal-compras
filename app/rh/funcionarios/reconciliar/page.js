import { requireRole } from "@/lib/session";
import ReconciliarClient from "./ReconciliarClient";

export const dynamic = "force-dynamic";

export default async function ReconciliarPage() {
  await requireRole(["ADMIN", "RH"]);
  return <ReconciliarClient />;
}
