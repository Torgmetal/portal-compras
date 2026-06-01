import { requireRole } from "@/lib/session";
import CompetenciasClient from "./CompetenciasClient";

export const dynamic = "force-dynamic";

export default async function CompetenciasPage() {
  await requireRole(["ADMIN", "RH"]);
  return <CompetenciasClient />;
}
