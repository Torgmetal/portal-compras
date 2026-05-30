import { requireRole } from "@/lib/session";
import { ScorecardClient } from "../IndicadoresClient";

export default async function ScorecardPage() {
  await requireRole(["ADMIN", "COMPRAS"]);
  return <ScorecardClient />;
}
