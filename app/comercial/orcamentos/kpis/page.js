import { requireRole } from "@/lib/session";
import KPIsClient from "./KPIsClient";


export default async function KPIsPage() {
  await requireRole(["ADMIN", "COMERCIAL"]);
  return <KPIsClient />;
}
