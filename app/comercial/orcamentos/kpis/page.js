import { requireRole } from "@/lib/session";
import KPIsClient from "./KPIsClient";

export const dynamic = "force-dynamic";

export default async function KPIsPage() {
  await requireRole(["ADMIN", "COMERCIAL"]);
  return <KPIsClient />;
}
